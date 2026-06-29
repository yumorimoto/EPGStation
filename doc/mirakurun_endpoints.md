# Mirakurun API Endpoints Used by EPGStation

This document outlines how EPGStation interacts with Mirakurun's REST API for live TV viewing and recording.

## 1. Live TV Viewing
**Endpoint:** `GET /api/services/{id}/stream`
- **Method in codebase:** `mirakurun.getServiceStream(channelId, ...)`
- **Location:** `src/model/service/stream/base/LiveStreamBaseModel.ts`
- **Description:** For live TV viewing, EPGStation requests a continuous stream for a specific service (channel). This stream does not automatically terminate based on program boundaries; it remains active as long as the connection is open.

## 2. Recording
EPGStation uses different endpoints for recording depending on how the recording was scheduled.

### A. EPG-based Reservations (Program ID specified)
**Endpoint:** `GET /api/programs/{id}/stream`
- **Method in codebase:** `mirakurun.getProgramStream({ id: reserve.programId, ... })`
- **Location:** `src/model/operator/recording/RecordingStreamCreator.ts`
- **Description:** When a recording is based on a specific program from the EPG, EPGStation asks Mirakurun for the stream of that specific program.
- **Behavior & Cut-offs:** Mirakurun handles the isolation of this program by monitoring the broadcast's Event Information Table (EIT) in real-time. If the program schedule changes (e.g., due to sports extensions), Mirakurun *should* dynamically adjust the stream duration based on the updated EIT. However, if the broadcaster fails to send timely EIT updates, or if there is a gap, Mirakurun may mistakenly conclude the program has ended and terminate the stream, causing the recording to cut off.

### B. Time-specified Reservations (No Program ID, manual timer)
**Endpoint:** `GET /api/services/{id}/stream`
- **Method in codebase:** `mirakurun.getServiceStream({ id: reserve.channelId, ... })`
- **Location:** `src/model/operator/recording/RecordingStreamCreator.ts` (inside `getTimeSpecifiedStream`)
- **Description:** When a user schedules a manual recording by specifying a start and end time (without selecting a specific program), EPGStation requests the service-level stream. It then manages the stream termination internally using a `setTimeout` based on the specified duration.

---

## Hypothesis on Recordings Cutting Off
Your hypothesis regarding recordings cutting off during extended broadcasts (like sports) is highly relevant to how `/api/programs/{id}/stream` functions.

Because EPG-based recordings rely on Mirakurun's `getProgramStream`, the stream's lifecycle is entirely dictated by Mirakurun's interpretation of the EIT stream. If a sports game extends and the broadcaster's EIT update is delayed or malformed, Mirakurun may drop the stream exactly at the originally scheduled end time.

### Potential Alternative (Service-level Stream)
If EPGStation were modified to *always* use `/api/services/{id}/stream` for recordings (even EPG-based ones), the stream would not be abruptly cut off by Mirakurun's EIT parsing. EPGStation could then manually stop the recording based on its own database, which it continually updates via EPG polling.

**Trade-offs of switching to service streams:**
1. **Pros:** The recording wouldn't be at the mercy of instantaneous EIT drops by Mirakurun. EPGStation could apply generous padding (margins) to the end of recordings, ensuring extensions are captured.
2. **Cons:** EPGStation would lose Mirakurun's precise EIT-based splitting, meaning recordings might contain trailing segments of the subsequent program. EPGStation would be entirely responsible for managing the start/stop timers.

Currently, the endpoint `GET /api/channels/{channel_type}/{channel}/stream` is **not** used for primary recording or live streaming operations in EPGStation; it relies on the Service ID (`/api/services/...`) instead to target specific sub-channels accurately.
