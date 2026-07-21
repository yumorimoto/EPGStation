# Automated Database Backup Plan

## Objective
To implement an automated, resilient backup mechanism for the EPGStation SQLite database. This feature aims to protect user data (reservations, recording history, drop logs) against catastrophic file system corruption by periodically creating safe snapshots of the database during periods of low system I/O and low database write activity.

## Motivation
SQLite database corruption (`SQLITE_CORRUPT: database disk image is malformed`) can occur during sudden power losses, disk space exhaustion, or underlying file system faults, particularly if these events happen during active database writes. EPGStation currently lacks a native, automated backup strategy. When corruption occurs and the SQLite header/root page is destroyed, standard recovery tools (like `.dump` or `.recover`) fail, resulting in total data loss unless external snapshots are maintained.

## Core Requirements
1.  **Safety:** Backups must be performed safely without locking the main application or causing `SQLITE_BUSY` errors for ongoing operations.
2.  **Timing:** Backups should only trigger during designated "idle" or "low-activity" windows (e.g., when no active recordings or encodings are running, or during deep night hours).
3.  **Rotation/Retention:** The system must implement a retention policy to prevent the backup directory from consuming excessive disk space (e.g., keep the last 7 daily backups).
4.  **Integration:** The feature should be integrated into EPGStation's native configuration (`config.yml`) and utilize the existing event-driven architecture.

## Implementation Details

### 1. Configuration (`config.yml`)
A new configuration block for database backups was introduced.

```yaml
# データベースの自動バックアップ設定 (sqliteのみ対応)
backup:
    enable: false
    # バックアップ先ディレクトリ (デフォルト: %DATA_DIR%/backups)
    # directory: '%DATA_DIR%/backups'
    # 保存する日数 (デフォルト: 7)
    # retentionDays: 7
    # 実行するスケジュール。cron形式 (デフォルト: '0 4 * * *' 毎日午前4時)
    # schedule: '0 4 * * *'
    # 録画・エンコード中でないときのみバックアップを実行するか (デフォルト: true)
    # requireIdle: true
```

### 2. Backup and Diagnostic Execution (`MaintenanceManageModel`)
Instead of using external schedulers like `node-cron`, the execution is managed natively via a `setInterval` loop (checking every 15 minutes) within `MaintenanceManageModel.ts`.

The execution utilizes the SQLite CLI (`sqlite3`) via `child_process.exec` because native bindings might be unstable or unavailable in certain LXC container environments.

1.  **Diagnostic:** Runs `PRAGMA integrity_check;`. If the output is not `ok`, it immediately logs a fatal error and suspends all further backups by writing to a lock file (`data/backup_suspended.lock`). This state persists across EPGStation restarts.
2.  **Backup:** Runs `.backup 'data/backups/database_YYYYMMDD.db'`. This is highly reliable, natively handles WAL integration, and guarantees a consistent snapshot without locking the main application.

### 3. Idle State Verification
Before triggering the maintenance tasks, `MaintenanceManageModel` checks if the system is idle (if `requireIdle` is `true`). It considers the system idle if:
1. There are no active recordings currently running.
2. There are no imminent recordings scheduled to start within the next **60 minutes**. (This is checked by querying `IReserveDB` via `findTimeRanges`).
3. There are no active encodings running (checked by querying `IEncodeManageModel.getEncodeInfo()`).

If the system is busy, the maintenance is deferred and retried every 15 minutes. If it cannot find an idle window for 24 hours (96 attempts), it abandons the attempt for that day.

### 4. Rotation and Cleanup
After a successful backup, `MaintenanceManageModel` scans the backup directory. It parses the modification times of existing backup files (`database_*.db`) and deletes any files older than the configured `retentionDays`.

## Restoration Procedure (For Users)
The recovery process remains manual to prevent accidental overwrites. To restore from an automated backup:
1. Stop EPGStation.
2. Delete the corrupted `database.db`, `database.db-wal`, and `database.db-shm` in the `data/` directory.
3. Copy the latest valid backup from `data/backups/database_YYYYMMDD.db` to `data/database.db`.
4. Restart EPGStation.
