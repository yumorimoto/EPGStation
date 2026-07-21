import { inject, injectable } from 'inversify';
import mirakurun from 'mirakurun';
import Util from '../util/Util';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import IConfiguration from './IConfiguration';
import container from './ModelContainer';

import IDBOperator from './db/IDBOperator';
import IConnectionCheckModel from './IConnectionCheckModel';
import ILogger from './ILogger';
import ILoggerModel from './ILoggerModel';
import IMirakurunClientModel from './IMirakurunClientModel';

@injectable()
export default class ConnectionCheckModel implements IConnectionCheckModel {
    private log: ILogger;
    private mirakurunClient: mirakurun;
    private dbOperator: IDBOperator;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IMirakurunClientModel') mirakurunClientModel: IMirakurunClientModel,
        @inject('IDBOperator') dbOperator: IDBOperator,
    ) {
        this.log = logger.getLogger();
        this.mirakurunClient = mirakurunClientModel.getClient();
        this.dbOperator = dbOperator;
    }

    /**
     * mirakurun との接続を待つ
     * @return Promise<void>
     */
    public async checkMirakurun(): Promise<void> {
        while (true) {
            try {
                this.log.system.info('check mirakurun');
                await this.mirakurunClient.getStatus();
                break;
            } catch (err: any) {
                this.log.system.error(err);
                await Util.sleep(1000);
            }
        }
    }

    /**
     * DB との接続を待つ
     */
    public async checkDB(): Promise<void> {
        while (true) {
            try {
                this.log.system.info('check db');
                await this.dbOperator.checkConnection();
                this.log.system.info('db connection ok');
                break;
            } catch (err: any) {
                this.log.system.error(err);
                await Util.sleep(1000);
            }
        }

        // Also check if sqlite and check its integrity, and note any suspended states
        const config = container.get<IConfiguration>('IConfiguration').getConfig();
        if (config.dbtype === 'sqlite') {
            const dataDir = path.join(__dirname, '..', '..', 'data');
            const dbFile = path.join(dataDir, 'database.db');
            const lockFile = path.join(dataDir, 'backup_suspended.lock');

            if (fs.existsSync(lockFile)) {
                this.log.system.fatal(
                    'WARNING: backup_suspended.lock found. Database corruption was previously detected.',
                );
            }

            try {
                this.log.system.info('Running startup database diagnostic (PRAGMA integrity_check)...');
                const cmd = `sqlite3 "${dbFile}" "PRAGMA integrity_check;"`;
                const stdout = child_process.execSync(cmd, { encoding: 'utf-8' });

                if (stdout.trim().toLowerCase() === 'ok') {
                    this.log.system.info('Startup database diagnostic passed: OK');
                } else {
                    this.log.system.fatal(`Startup database diagnostic failed! Output: ${stdout}`);
                }
            } catch (err: any) {
                this.log.system.error(`Failed to run startup database diagnostic: ${err.message}`);
            }
        }
    }
}
