# EPGStation Encode Progress Architecture

This document outlines how encoding progress information flows from a custom encoding script (e.g., `config/enc-qsv-h264.js`) to the EPGStation user interface.

## 1. Custom Encoding Script (`config/enc-qsv-h264.js`)
- The custom script spawns an `ffmpeg` child process.
- It listens to `ffmpeg`'s `stderr` for output containing `frame= XXX`.
- It calculates the percentage completion using the total frames (derived from the `DURATION` environment variable and an assumed FPS).
- Crucially, it emits a JSON object to `stdout` in the following format:
  ```json
  {"type":"progress", "percent": 0.45, "log": "frame= 1350 ..."}
  ```

## 2. Encoder Model (`src/model/service/encode/EncoderModel.ts`)
- `EncoderModel` manages the execution of the custom script as a child process.
- It attaches an event listener to the child process's `stdout`: `this.childProcess.stdout.on('data', ...)`.
- As data chunks arrive, they are passed to `updateEncodingProgressInfo(data)`.
- **Current Vulnerability:** The data chunks are currently converted directly to strings and split by `\n`. Because standard output streams buffer and chunk data unpredictably, a single chunk might contain an incomplete JSON string (e.g., `{"type":"progr`). The `JSON.parse()` will silently fail inside the `try/catch` block, preventing progress from updating.

## 3. Encode Manage Model (`src/model/service/encode/EncodeManageModel.ts`)
- Manages the queue of running and waiting encodes.
- Periodically (when queried by the API), it loops through running encodes and calls `getProgressInfo()` on the respective `EncoderModel` instance.
- It maps the `percent` and `log` from the `EncoderModel` into `EncodeInfoItem`.

## 4. API Layer (`src/model/api/encode/EncodeApiModel.ts`)
- Exposes the `/encode` API endpoint.
- Calls `encodeManage.getEncodeInfo()` and maps the `percent` and `log` fields into the `apid.EncodeProgramItem` payload that is sent to the client.

## 5. Socket.io Updates (`src/model/service/socketio/SocketIOManageModel.ts`)
- When progress updates, `EncodeEvent` triggers `emitUpdateEncodeProgress()`.
- This tells `SocketIOManageModel` to emit an `updateEncode` event via WebSockets to connected clients.

## 6. Frontend (`client/src/...`)
- **State Management (`EncodeState.ts`):** Fetches data from the API and converts `apid.EncodeProgramItem` into `EncodeInfoDisplayItem`. If `item.percent` exists, it calculates `result.display.percent = item.percent * 100`.
- **UI (`EncodeSmallCard.vue`):** Reactively renders a `<v-progress-linear>` component if `item.display.percent` is defined. The `updateEncode` socket event triggers a refetch of the data, updating the progress bar.
