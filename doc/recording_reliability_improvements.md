# Recording Reliability Improvements

This document outlines the recent architectural improvements made to EPGStation's backend to increase recording reliability, especially in scenarios involving I/O pauses (like Proxmox LXC snapshot backups), tuner stream instability, and dynamic real-time EPG shifts.

## 1. Reservation History & Verification Logic

By default, EPGStation deletes reservations once they have finished. To ensure that missing or incomplete recordings do not go unnoticed, a mechanism was introduced to persist past reservations and cross-reference them against the resulting recordings.

*   **`ReserveHistory` Database Entity:**
    *   Added a new database entity (`ReserveHistory`) along with corresponding SQLite and MySQL migrations to persist expired reservations after they finish.
*   **Reservation Cleanup & Cross-checking:**
    *   **Modified File:** `src/model/model/ReservationManageModel.ts`
    *   **Logic:** When cleaning up the main EPG and reservation tables, expired reservations are now moved to the `reserve_history` table.
    *   **Verification:** During this insertion, an immediate cross-check is performed against the `Recorded` database.
    *   **Alerting:** If the corresponding recording is completely missing, or if its actual duration is more than 90 seconds shorter than the scheduled duration, the system logs an error to the system log (using the `Logger` library) with the phrase: `"Recording Verification Failed"`.

## 2. Robustness Against I/O Pauses (LXC Snapshots)

When running inside environments like Proxmox LXC containers backed by ZFS, taking a snapshot can temporarily block all disk I/O. Previously, this caused EPGStation's internal execution queue to time out and crash.

*   **Extended Execution Queue Timeout:**
    *   **Modified File:** `src/model/model/ExecutionManagementModel.ts`
    *   **Logic:** Increased the `getExecution` timeout from 1 minute to 5 minutes.
    *   **Impact:** EPGStation will now patiently wait out temporary I/O freezes (like those during backups) instead of failing operations prematurely.

## 3. Resilience to Stream Drops & EPG Shifts

Broadcasting environments can be unpredictable. Real-time EPG shifts can cause program-based stream endpoints (like those provided by `mirakc`/Mirakurun API) to return 404 or drop the stream. Additionally, signal loss can cause premature stream closures.

*   **Stream Fallback Mechanism:**
    *   **Modified File:** `src/model/model/RecordingStreamCreator.ts`
    *   **Logic:** Implemented a fallback mechanism. If the tuner backend (`mirakc`) drops the `getProgramStream` request with a 404/408 (often due to real-time EPG shifts), the system gracefully falls back to using `getServiceStream` based on the physical channel ID.
*   **Increased Reconnection Retries:**
    *   **Modified File:** `src/model/model/RecordingManageModel.ts`
    *   **Logic:** Increased the maximum number of recording retry attempts from 3 to 30.
*   **Immediate Re-engagement on Premature Closure:**
    *   **Modified File:** `src/model/model/RecorderModel.ts`
    *   **Logic:**
        *   Improved backend logging to explicitly capture when and why streams close prematurely.
        *   When `ERR_STREAM_PREMATURE_CLOSE` occurs, the error is explicitly forwarded down the chain to forcefully and immediately trigger the retry logic.
        *   If the recording has already started (`setTimer` calculates a time < 0), the system instantly fires the stream request without delay.
    *   **Impact:** If the tuner loses signal and cuts the socket, EPGStation instantly establishes a new socket and appends the new TS data to the exact same recording file, attempting up to 30 times to guarantee as much of the program is recorded as possible.

## 4. Pending Features & Future Work

While the above changes significantly improve backend reliability, the following features are planned for future implementation:

*   **Exponential Backoff for Retries:** The current 30 reconnection retries fire rapidly. This should be updated to implement a gradual/exponential backoff strategy to reduce spamming the tuner backend.
*   **Frontend UI State Fix:** Currently, when a recording fails or stops in the backend, the frontend EPG table incorrectly continues to show it as "recording" (indicated by a red box). This state discrepancy needs to be resolved.
*   **Manual Retry Button in UI:** Add a proper UI button in the frontend to allow users to manually retry or restart a failed recording.
