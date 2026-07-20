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

## Architectural Design

### 1. Configuration (`config.yml`)
Introduce a new configuration block for database backups.

```yaml
backup:
  enable: true
  directory: '%DATA_DIR%/backups'
  retentionDays: 7
  schedule: '0 4 * * *' # Cron format: default to 4:00 AM
  requireIdle: true     # Only backup if no recordings/encodings are active
```

### 2. Backup Execution Strategy
Because TypeORM operates with `enableWAL: true` and SQLite handles concurrent reads well, taking a backup while the WAL is active requires care to ensure consistency.

**Option A: The SQLite Online Backup API (Preferred)**
Utilize the native `sqlite3` Backup API (often exposed via `better-sqlite3` or directly via TypeORM/sqlite driver extensions if available). This API safely copies the database page by page while allowing concurrent reads/writes on the source database. It automatically handles WAL checkpoints during the copy.

**Option B: The `.backup` CLI Command**
If native bindings are unavailable or unstable in the LXC container environment, spawn a child process to invoke the SQLite CLI:
`sqlite3 data/database.db ".backup 'data/backups/database_YYYYMMDD.db'"`
This is highly reliable, natively handles WAL integration, and guarantees a consistent snapshot without requiring a manual `VACUUM INTO`.

### 3. Idle State Verification (`BackupManageModel`)
Create a new model (`BackupManageModel.ts`) responsible for orchestrating the backup. Before triggering Option B, the model will:
1. Check `RecordingManageModel` to ensure no active streams/recordings are running.
2. Check `EncodeManageModel` to ensure the `runningQueue` is empty.
3. Check `ExecutionManagementModel` to ensure no exclusive database locks are currently held.
If `requireIdle: true` is set and the system is busy, the backup will be deferred and retried after a configured interval (e.g., 30 minutes).

### 4. Rotation and Cleanup
After a successful backup, `BackupManageModel` will scan the backup directory. It will parse the timestamps of existing backup files and delete any files older than the configured `retentionDays`.

### 5. Event Driven Triggering
Integrate the Cron schedule using a lightweight scheduler (like `node-cron` or a simple interval timer aligned to the hour) initialized during the EPGStation startup sequence (e.g., in `src/model/ModelContainerSetter.ts`).

## Implementation Steps
1.  **Define Config Types:** Update `src/IConfigFile.ts` and `config.yml.template` with the new `backup` structure.
2.  **Create Backup Model:** Implement `src/model/db/BackupManageModel.ts` with the logic to verify idle state, execute the CLI backup command via `ProcessUtil`, and manage file rotation.
3.  **Register Model:** Bind the new model in `ModelContainerSetter.ts` and ensure it is instantiated on startup.
4.  **Logging:** Ensure all backup successes, deferrals (due to active states), and failures are logged to `this.log.system`.
5.  **Documentation:** Update the `doc/` directory with a guide on how to configure and restore from these automated backups.

## Restoration Procedure (For Users)
The recovery process will remain manual to prevent accidental overwrites. The documentation will instruct users to:
1. Stop EPGStation.
2. Delete the corrupted `database.db`, `database.db-wal`, and `database.db-shm`.
3. Copy the latest valid backup from `data/backups/database_YYYYMMDD.db` to `data/database.db`.
4. Restart EPGStation.
