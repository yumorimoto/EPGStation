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
1. There are no imminent recordings scheduled to start within the next **60 minutes**, which also covers currently running recordings. (This is checked by querying `IReserveDB` via `findTimeRanges`).
2. There are no active encodings running (checked by querying `IEncodeManageModel.getEncodeInfo()`).

If the system is busy, the maintenance is deferred and retried every 15 minutes. If it cannot find an idle window for 24 hours (96 attempts), it abandons the attempt for that day.

### 4. Rotation and Cleanup
After a successful backup, `MaintenanceManageModel` scans the backup directory. It parses the modification times of existing backup files (`database_*.db`) and deletes any files older than the configured `retentionDays`.

## Original Architectural Concepts & Alternatives (Retained for Reference)

### Backup Execution Strategy
Because TypeORM operates with `enableWAL: true` and SQLite handles concurrent reads well, taking a backup while the WAL is active requires care to ensure consistency.

**Option A: The SQLite Online Backup API (Preferred but not implemented)**
Utilize the native `sqlite3` Backup API (often exposed via `better-sqlite3` or directly via TypeORM/sqlite driver extensions if available). This API safely copies the database page by page while allowing concurrent reads/writes on the source database. It automatically handles WAL checkpoints during the copy.

**Option B: The `.backup` CLI Command (Implemented)**
If native bindings are unavailable or unstable in the LXC container environment, spawn a child process to invoke the SQLite CLI:
`sqlite3 data/database.db ".backup 'data/backups/database_YYYYMMDD.db'"`
This is highly reliable, natively handles WAL integration, and guarantees a consistent snapshot without requiring a manual `VACUUM INTO`.

### Alternative Backup Strategy: API-Driven Data Export
While full SQLite file backups are ideal for total disaster recovery, they are susceptible to restoring hidden, pre-existing corruption (if a snapshot is taken after corruption occurs but before it is detected).

An alternative or complementary strategy is to use the native EPGStation REST APIs to export entity data (like reservation rules) into a separate format (e.g., JSON).

#### Benefits
1. **Data Sanitization:** Extracting data via the API ensures only valid, readable data is exported. If the database is partially corrupted (e.g., the `recorded` table is broken but the `rule` table is intact), the API can still salvage the intact rules.
2. **Format Agnosticism:** JSON exports can be easily re-imported into a brand-new, freshly initialized database, bypassing any underlying structural corruption of the old SQLite file.

#### Implementation Concept (`rule_manager.js`)
A Node.js utility script can be maintained in the `tools/` directory.
*   **Backup Mode:** The script sends a `GET /api/rules` request, parses the response, and writes the array of rules to a `rules_backup.json` file.
*   **Restore Mode:** The script reads `rules_backup.json` and iterates through the array, stripping out auto-generated fields (like IDs) and sending `POST /api/rules` requests to recreate the logic.

*Example Usage:*
```bash
node tools/rule_manager.js backup   # Exports current rules
# ... (User resets the database) ...
node tools/rule_manager.js restore  # Injects rules into the fresh DB
```

### Continuous Diagnostics & Corruption Detection
To prevent the scenario where automated backups simply copy already-corrupted databases (or where snapshots roll back to corrupted states), EPGStation should implement proactive, continuous database diagnostics.

#### Objective
Automatically run SQLite integrity checks during optimal idle windows to detect `SQLITE_CORRUPT` scenarios early, before massive data loss occurs, and optionally alert the user or halt further destructive writes.

#### Technical Implementation

##### 1. The Diagnostic Query
The core diagnostic mechanism will utilize SQLite's native PRAGMA commands:
```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```
If the database is healthy, `integrity_check` returns a single row containing the string `"ok"`. Any other output indicates B-Tree damage, invalid page references, or malformed disk images.

##### 2. Diagnostic Scheduling (Idle Window Detection)
Integrity checks require traversing the entire database, which can consume significant I/O and CPU, potentially locking the database and interrupting live TV or recordings. Therefore, checks must be strictly scheduled.

A `DiagnosticManageModel` will be responsible for finding safe windows. It will trigger daily (e.g., via Cron) but will only execute if:
1.  **No Active Writes:** `RecordingManageModel` confirms no recordings are currently active.
2.  **No Imminent Recordings:** The scheduler checks the upcoming reservations and ensures no recording is scheduled to start within the next **60 minutes**. (This provides ample time for the integrity check to complete without overlapping a broadcast).
3.  **No Encodings:** `EncodeManageModel` confirms the running queue is empty.

If the criteria are not met, the check is deferred and retried every 15 minutes until a safe window is found.

##### 3. Execution via CLI Fallback
Because running `PRAGMA integrity_check;` via TypeORM might fail catastrophically if the database is already severely corrupted (causing the Node process to crash entirely), the diagnostic check should ideally be run via a spawned child process executing the `sqlite3` CLI tool:
```bash
sqlite3 data/database.db "PRAGMA integrity_check;"
```
The Node application will parse the `stdout`.

##### 4. Handling Corruption
If the check returns anything other than `"ok"`:
1.  **Logging:** Emit an immediate `[FATAL]` error to the system logs (`this.log.system.fatal('Database corruption detected during routine diagnostic!')`).
2.  **Backup Suspension:** The `BackupManageModel` must immediately suspend all automated file-level backups to prevent overwriting healthy, older backups with the newly corrupted file.
3.  **UI Alert (Future):** Propagate a critical alert via the API to the Vue frontend, displaying a persistent warning banner to the administrator that the database requires manual intervention.

## Restoration Procedure (For Users)
The recovery process remains manual to prevent accidental overwrites. To restore from an automated backup:
1. Stop EPGStation.
2. Delete the corrupted `database.db`, `database.db-wal`, and `database.db-shm` in the `data/` directory.
3. Copy the latest valid backup from `data/backups/database_YYYYMMDD.db` to `data/database.db`.
4. Restart EPGStation.
