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

## 5. Transition to Service-Based Streams for Ultimate Reliability (In Progress)

Analysis of `mirakc` logs revealed that using `getProgramStream` (which utilizes the backend's `filter-program` based on EIT data) delegates stream termination to the tuner backend. If the tuner backend detects an EIT change or simply drops the stream, it sends a clean EOF to EPGStation.

For example, the following `mirakc` logs show a stream ending cleanly from the backend's perspective, causing EPGStation to receive an EOF without any socket error:
```
DEBUG mirakc_core::broadcaster: EOF, unbind stream broadcaster.id=0.126
DEBUG mirakc_core::mpeg_ts_stream: EOF stream.id=0.126.1
...
INFO mirakc_core::tuner: Streaming stopped stream.id=0.126.4
```
Because no error is thrown on the socket, EPGStation assumes the recording or stream finished perfectly, bypassing the 30-retry logic entirely.

To give EPGStation absolute control over recording durations and to handle tuner glitches robustly, a two-step plan is being implemented:

### Step 1: Validate Reconnection Logic on Live Streams (`getServiceStream`)
Currently, live streaming uses `getServiceStream` (via the channel/service ID). If the tuner glitches and sends a premature EOF, EPGStation might interpret it as a clean exit and stop the live stream. We are updating the stream handling logic to detect when a stream ends prematurely (without a user-initiated stop). When a premature EOF is detected, EPGStation will explicitly throw an error to trigger its internal retry mechanisms, automatically reconnecting the live stream for the user instead of terminating it.

### Step 2: Migrate Recordings to `getServiceStream`
Once Step 1 is validated and EPGStation reliably recovers live streams from tuner glitches, we will update `RecordingStreamCreator.ts`. We will deprecate the use of `getProgramStream` for recordings. Instead, all EPG-based recordings will route through `getServiceStream` (the same logic currently used for time-specified recordings). We will also apply the EOF time-check logic to `RecorderModel.ts`: if the stream closes before the scheduled `endAt` time, EPGStation will treat it as a failure and trigger the recording retry logic.

## 6. Long-Term Architectural Proposal: Native `mirakc` Integration

Currently, EPGStation relies heavily on the `mirakurun` npm package for tuner integration. While this ensures compatibility with standard Mirakurun instances, it fundamentally limits EPGStation's ability to respond to internal tuner state changes. When stream drops or EIT shifts occur, EPGStation is blind to the root cause, relying purely on socket closures (EOFs) to guess what happened.

Because the project is prioritizing absolute reliability over legacy Mirakurun compatibility, the strategic direction is to completely drop the `mirakurun` npm dependency and optimize exclusively for `mirakc`.

### Leveraging the `mirakc` SSE API
`mirakc` provides a robust, real-time Server-Sent Events (SSE) endpoint (`/events`). By subscribing to this endpoint, EPGStation can receive explicit, JSON-formatted lifecycle events such as:
*   `tuner.started` / `tuner.stopped`
*   `stream.started` / `stream.stopped`
*   `epg.programs-updated`
*   `service.stream-stopped`

By moving to an event-driven architecture powered by `mirakc`'s SSE, EPGStation can definitively distinguish between a user-initiated stop, a scheduled program end, and a tuner crash/signal loss.

### High-Level Rearchitecture Options
*   **Option A (Complete Replacement):** Rip out the `IMirakurunClientModel` entirely. Build a native `MirakcClientModel` using `axios` or native Node `http/https` modules to interact with `mirakc` REST APIs, paired with an `EventSource` implementation to consume the `/events` stream. This involves rewriting all API calls (EPG fetching, stream requests).
*   **Option B (Hybrid Wrapper):** Maintain the `mirakurun` npm package for standard REST calls (like fetching EPG schedules or starting streams) to save development time, but build a supplementary `MirakcEventMonitorModel` that connects to `/events`. EPGStation's state machines (Recording/Streaming) would prioritize instructions from the Event Monitor over socket EOFs.

### Comprehensive Test Plan for Migration
Migrating away from the established `mirakurun` client requires rigorous validation.
1.  **Unit Testing:** Implement mock `mirakc` API and SSE endpoints to simulate various failure states (signal loss, backend crashes, dynamic EIT shifts) and verify EPGStation's state machine responds correctly.
2.  **Concurrency Testing:** Validate that the new client handles rapid, concurrent tuner requests without exhausting connections or causing deadlocks (a common issue when managing raw HTTP sockets compared to relying on an established SDK).
3.  **Live Environment Validation:** Deploy the changes to an LXC/ZFS environment and simulate I/O pauses and signal degradation to ensure the SSE stream remains stable or reconnects automatically if dropped.
