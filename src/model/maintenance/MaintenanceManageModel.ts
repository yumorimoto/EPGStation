import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import ILogger from '../ILogger';
import ILoggerModel from '../ILoggerModel';
import IConfigFile from '../IConfigFile';
import IConfiguration from '../IConfiguration';

import IEncodeManageModel from '../service/encode/IEncodeManageModel';
import IReserveDB from '../db/IReserveDB';
import IMaintenanceManageModel from './IMaintenanceManageModel';

/**
 * MaintenanceManageModel
 * データベースのバックアップと診断（integrity_check）を定期的に実行するモデル。
 * 録画やエンコードが実行されていないアイドル状態の時にのみバックアップを行う。
 * データベースの破損を検知した場合はバックアップを停止し、安全性を保つ。
 */
@injectable()
export default class MaintenanceManageModel implements IMaintenanceManageModel {
    private log: ILogger;
    private config: IConfigFile;

    private encodeManageModel: IEncodeManageModel;
    private reserveDB: IReserveDB;

    private timerId: NodeJS.Timeout | null = null;
    private checkIntervalTime = 15 * 60 * 1000; // 15 min
    private dbFile: string;
    private backupDir: string;
    private lockFile: string;

    // retry logic
    private lastAttemptDay: string | null = null;
    private attemptCount: number = 0;
    private isBackupSuspended: boolean = false;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,

        @inject('IEncodeManageModel') encodeManageModel: IEncodeManageModel,
        @inject('IReserveDB') reserveDB: IReserveDB,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();

        this.encodeManageModel = encodeManageModel;
        this.reserveDB = reserveDB;

        const dataDir = path.join(__dirname, '..', '..', '..', 'data');
        this.dbFile = path.join(dataDir, 'database.db');

        if (this.config.backup?.directory) {
            let backupDirPath = this.config.backup.directory;
            backupDirPath = backupDirPath.replace(/%DATA_DIR%/g, dataDir);
            this.backupDir = backupDirPath;
        } else {
            this.backupDir = path.join(dataDir, 'backups');
        }

        this.lockFile = path.join(dataDir, 'backup_suspended.lock');

        if (fs.existsSync(this.lockFile)) {
            this.isBackupSuspended = true;
            this.log.system.fatal('Database corruption previously detected. Backups are suspended.');
        }
    }

    public start(): void {
        this.log.system.debug('MaintenanceManageModel start() invoked');
        if (this.config.dbtype !== 'sqlite') {
            this.log.system.debug('Maintenance aborted: dbtype is not sqlite');
            return;
        }

        if (this.config.backup?.enable !== true) {
            this.log.system.debug('Maintenance aborted: backup.enable is not true');
            return;
        }

        this.log.system.info('start maintenance management');
        this.timerId = setInterval(() => {
            this.checkAndRunMaintenance();
        }, this.checkIntervalTime);
    }

    public stop(): void {
        if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    private async checkAndRunMaintenance(): Promise<void> {
        const targetHour = this.config.backup?.backupHour ?? 4;
        const now = new Date();
        const currentHour = now.getHours();

        this.log.system.debug(`Checking maintenance schedule. Current hour: ${currentHour}, Target hour: ${targetHour}`);

        if (this.isBackupSuspended) {
            this.log.system.debug('Maintenance aborted: isBackupSuspended is true');
            return;
        }
        const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        if (currentHour < targetHour) {
            return;
        }

        // new day reset
        if (this.lastAttemptDay !== todayStr) {
            this.lastAttemptDay = todayStr;
            this.attemptCount = 0;
        }

        // wait for idle logic if requireIdle is true or not set (default true)
        const requireIdle = this.config.backup?.requireIdle !== false;

        if (requireIdle) {
            const isIdle = await this.isSystemIdle();
            if (!isIdle) {
                this.attemptCount++;
                // retry up to 24 hours (24 * 60 / 15 = 96 attempts)
                if (this.attemptCount > 96) {
                    this.log.system.error('Maintenance aborted for the day due to system never being idle.');
                    this.attemptCount = 0; // prevent further attempts today
                } else {
                    this.log.system.info(`System is not idle, deferring maintenance. Attempt: ${this.attemptCount}`);
                }
                return;
            }
        }

        if (this.attemptCount === -1) {
            // Already succeeded today
            return;
        }

        this.log.system.info('Running database diagnostic and backup...');

        try {
            const isHealthy = await this.runDiagnostic();
            if (!isHealthy) {
                this.isBackupSuspended = true;
                fs.writeFileSync(this.lockFile, '1', 'utf-8');
                this.log.system.fatal('Database corruption detected during routine diagnostic! Backups suspended.');
                return;
            }

            await this.runBackup();
            this.cleanupOldBackups();

            // Mark as done for the day
            this.attemptCount = -1;
        } catch (err: any) {
            this.log.system.error('Error during maintenance window');
            this.log.system.error(err);
        }
    }

    private async isSystemIdle(): Promise<boolean> {
        // 1. Check active recordings
        try {
            // Using a simple check via reserveDB if recordingManageModel is too complex
            // A more robust way is querying reserveDB for currently recording
            const nowTime = new Date().getTime();
            const reserves = await this.reserveDB.findTimeRanges({
                times: [{ startAt: nowTime - 24 * 60 * 60 * 1000, endAt: nowTime + 60 * 60 * 1000 }], // within next hour
                hasSkip: false,
                hasConflict: false,
                hasOverlap: false,
            });

            // If there's any active or imminent reservation (within 60 mins), it's not idle
            const imminent = reserves.find(r => {
                return r.startAt <= nowTime + 60 * 60 * 1000 && r.endAt >= nowTime;
            });

            if (imminent) {
                this.log.system.debug('System is not idle: Active or imminent recording found');
                return false;
            }
        } catch (e) {
            this.log.system.error('Error checking reservations for idle status');
            return false;
        }

        // 2. Check active encodings
        try {
            const queueInfo = this.encodeManageModel.getEncodeInfo();
            if (queueInfo.runningQueue.length > 0) {
                this.log.system.debug('System is not idle: Active encoding running');
                return false;
            }
        } catch (e) {
            this.log.system.error('Error checking encode queue for idle status');
            return false;
        }

        return true;
    }

    private runDiagnostic(): Promise<boolean> {
        return new Promise(resolve => {
            const cmd = `sqlite3 "${this.dbFile}" "PRAGMA integrity_check;"`;
            child_process.exec(cmd, (error, stdout) => {
                if (error) {
                    this.log.system.error(`Diagnostic execution error: ${error.message}`);
                    resolve(false);
                    return;
                }
                if (stdout.trim().toLowerCase() !== 'ok') {
                    this.log.system.error(`Diagnostic failed. Output: ${stdout}`);
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    }

    private runBackup(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            const now = new Date();
            const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
            const backupFile = path.join(this.backupDir, `database_${dateStr}.db`);

            this.log.system.info(`Creating backup: ${backupFile}`);

            const cmd = `sqlite3 "${this.dbFile}" ".backup '${backupFile}'"`;
            child_process.exec(cmd, error => {
                if (error) {
                    this.log.system.error(`Backup execution error: ${error.message}`);
                    reject(error);
                    return;
                }
                this.log.system.info(`Backup created successfully: ${backupFile}`);
                resolve();
            });
        });
    }

    private cleanupOldBackups(): void {
        try {
            if (!fs.existsSync(this.backupDir)) {
                return;
            }

            const retentionDays = this.config.backup?.retentionDays || 7;
            const now = new Date().getTime();
            const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

            const files = fs.readdirSync(this.backupDir);
            for (const file of files) {
                if (file.startsWith('database_') && file.endsWith('.db')) {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > retentionMs) {
                        this.log.system.info(`Deleting old backup: ${filePath}`);
                        fs.unlinkSync(filePath);
                    }
                }
            }
        } catch (e) {
            this.log.system.error('Error cleaning up old backups');
            this.log.system.error(e);
        }
    }
}
