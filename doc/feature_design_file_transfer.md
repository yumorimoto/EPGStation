# EPGStation File Transfer Specification

This document outlines the architecture, data models, logic flow, and execution mechanisms for the Rsync-based file transfer feature integrated into EPGStation.

## 1. Overview & Objectives
The goal of this feature is to natively support automated and manual transfers of encoded `.mp4` or raw `.m2ts` files to external storage (e.g., a NAS) without relying on external cronjobs. It features an intelligent queue manager, scheduled batch transferring, automatic concurrency limits, robust database tracking, and a Vue.js-based UI.

## 2. Configuration (`config.yml` & `IConfigFile.ts`)
To configure file transfers, users add a `file_transfer` block to `config.yml`.
*   **`host`**: Destination server IP or hostname.
*   **`port`**: SSH port (default: 22).
*   **`user`**: Remote SSH username.
*   **`private_key_path`**: Absolute path to the SSH private key. *Password auth is not supported.*
*   **`bandwidth_limit`**: Desired cap in Megabits per second (Mbps). Internally converted to KB/s for rsync.
*   **`destination_directories`**: An array mapping display names to remote server paths (e.g., `[{name: 'tv', path: '/media/tv'}]`).
*   **`batch_schedule`**: An array of named CRON schedules to delay transfers until off-peak hours.
*   **`rsyncCmd` / `sshCmd`**: Optional overrides for the binary execution paths.

### Intelligent Auto-Delete (`action: 'intelligent_remove'`)
If storage drops below `limitThreshold`, EPGStation deletes old recordings. By changing the config action from `remove` to `intelligent_remove`, EPGStation's `StorageManageModel` checks if an old recording has *both* a raw `.m2ts` file and a valid encoded `.mp4` file. If so, it selectively deletes the `.m2ts` file only, saving space while retaining a playable version.

## 3. Database Schema (`TransferTask.ts`)
We introduce a TypeORM entity `TransferTask` to track transfer state.
*   **`id`** (PK): Auto-increment identifier.
*   **`recordedId`** (FK): Links to `Recorded`. `ON DELETE CASCADE`. If the recording is completely purged, the transfer history vanishes to save space.
*   **`videoFileId`** (FK): Links to `VideoFile`. `ON DELETE SET NULL`. If the specific file is purged but the recording metadata remains, we keep the transfer history.
*   **`status`**: String indicating state (`pending`, `running`, `completed`, `failed`, `retrying`).
*   **`retryCount`**: Integer tracking backoff cycles.
*   **`errorLog`**: Text capturing `stderr` from failed processes.

## 4. Transfer Manager (`TransferManageModel.ts`)
This class acts as a single-threaded Promise queue to prevent network and disk IO saturation.

### `checkQueue()`
Triggered by events, this method scans the DB for tasks in the `pending` or `retrying` state. 
- It applies a strict concurrency limit of 1 active transfer at a time.
- If a task has a `scheduleName`, it checks the cron expression using `cron-parser`. If the time has not arrived, it skips the task until the next check cycle.

### `executeTransfer(task: TransferTask)`
This is the core execution method where `rsync` is spawned.
- **Input:** A `TransferTask` object from the database.
- **Output:** Modifies the DB status to `completed` or `failed` based on the process exit code.
- **Rsync Invocation:**
  It dynamically builds an argument array. For example:
  ```bash
  rsync -avz -e "ssh -p 22 -i ~/.ssh/id_rsa -o StrictHostKeyChecking=no" --partial --bwlimit=12500 /local/video.mp4 user@10.0.0.5:/remote/dir/
  ```
  *(Note for future Rclone implementation: To swap this to `rclone`, this exact `executeTransfer` method must be refactored to construct an `rclone copy` command using the target SSH parameters, omitting the `-e` flag and modifying bandwidth limits to use `--bwlimit 100M` format).*

### `handleTransferFailure(task: TransferTask, errorLog: string)`
If `rsync` fails (network drop, permissions error), this method increments the `retryCount`. It uses an exponential backoff formula (`Math.pow(2, task.retryCount) * 1m`) to reschedule the task. It maxes out at `max_retries` (default 5).

## 5. Hooks & APIs
- **Hooks (`EventSetter.ts`)**: We listen to `encodeEvent.setFinishEncode()` and `recordingEvent.setFinishRecording()`. When these fire, we call `enqueueTransfersForRecorded()` which evaluates if the new file should be added to the `TransferTask` DB.
- **APIs**:
  - `GET /api/transfers`: Retrieves active/pending queue for the UI.
  - `POST /api/transfers`: Manually enqueues a new transfer task.
  - `DELETE /api/transfers/:transferId`: Cancels an active `rsync` process via `childProcess.kill('SIGTERM')`.
  - `POST /api/transfers/:transferId/retry`: Resets a `failed` task to `retrying` and bumps it to the top of the queue.

## 6. Frontend UI (Vue)
A new "Transfers" (転送) tab is added to the sidebar.
- `TransferState.ts`: Polls the `GET /api/transfers` endpoint every 5 seconds.
- `TransferItems.vue`: Displays a filterable list (All, Pending, Running, Failed).
- `TransferSmallCard.vue`: Renders individual task data, including destination folder, retry counts, error logs, an indeterminate progress bar for running tasks, and actionable Cancel/Retry buttons.
