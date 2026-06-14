# Live Streaming Architecture

This document describes the design and inner workings of EPGStation's live streaming functionality, covering settings, backend data flow, ffmpeg pipeline, and the frontend Vue client usage.

## 1. Overview

EPGStation's live streaming allows users to stream active broadcast TS (Transport Stream) data, received from a mirakurun-compatible PVR backend, directly to web browsers or external media players (like VLC or mobile apps).

It supports multiple streaming formats to accommodate various client capabilities and network conditions:
*   **M2TS:** Unaltered MPEG-2 TS stream (often MPEG-2 Video or H.264). Provides raw broadcast quality but requires high bandwidth and a client capable of decoding it (e.g., external media players).
*   **M2TS-LL (Low Latency):** A low-latency variant of the raw TS stream, often used with specialized web players like `mpegts.js`.
*   **WebM:** Real-time transcoded video (VP9/Vorbis) suitable for most modern web browsers natively via HTML5 `<video>`.
*   **MP4:** Real-time transcoded video (H.264/AAC) wrapped in a fragmented MP4 container. Highly compatible with mobile devices and browsers via Media Source Extensions (MSE).
*   **HLS (HTTP Live Streaming):** Real-time segmented video. Best for mobile networks and long-running stable streams on compatible devices (e.g., Safari natively, or other browsers via HLS.js).

## 2. Configuration (`config.yml`)

The live streaming behavior is primarily dictated by the `streamConfig.live` section within `config.yml`.

### Presets

Under each format type (e.g., `ts.mp4`), an array of presets is defined. Each preset contains:
*   `name`: The display name shown in the frontend UI dropdown (e.g., "720p", "Audio-Only (64k)").
*   `cmd`: The FFmpeg command string used to transcode or copy the stream.

### Command Structure and Variables

The `cmd` string utilizes internal template variables replaced at runtime by EPGStation:
*   `%FFMPEG%`: Path to the FFmpeg executable.
*   `%OUTPUT%`: The designated output path (used heavily in HLS for the playlist file). For piped output (like MP4 or WebM), `pipe:1` is used instead.
*   `%streamFileDir%`: Directory where HLS segments are temporarily stored.
*   `%streamNum%`: A unique identifier for the current stream session.

**FFmpeg Pipeline Example (MP4 Hybrid Hardware Acceleration):**
```bash
%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v h264_qsv -global_quality:v 28 -look_ahead 0 -vf bwdif=mode=send_field:parity=auto:deint=all,scale=-2:720 -profile:v main -preset veryfast -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1
```
*Key aspects for live streaming commands:*
*   **`-i pipe:0`**: EPGStation pipes the raw TS data from mirakurun directly into ffmpeg's stdin.
*   **`-sn`**: Drops subtitle tracks (essential if avoiding complex subtitle burning).
*   **Deinterlacing**: Broadcast TV is often interlaced. CPU filters like `yadif` or `bwdif` are used before hardware encoding.
*   **Omission of `-re`**: Crucially, for hardware pipelines or fast CPU pipelines, `-re` (read at native frame rate) is generally omitted for live TS inputs. The source stream (mirakurun) inherently controls the pace. Adding `-re` can cause artificial throttling, leading to jitter in playback.
*   **`-f mp4 pipe:1`**: Outputs the transcoded fragmented MP4 data to stdout, which EPGStation relays to the client.

## 3. Backend Architecture

### 3.1. Stream Initialization Flow

1.  **API Request:** The client calls `/api/streams/live/:channelId/:mode` (e.g., `/api/streams/live/3273601024/mp4?mode=1`).
2.  **`StreamApiModel`:** The API layer (`src/model/api/stream/StreamApiModel.ts`) receives the request.
    *   It fetches channel details and selects the correct FFmpeg `cmd` string based on the `mode` index from `config.yml`.
    *   It creates a new instance of a stream model (e.g., `LiveStreamModel`).
3.  **`StreamManageModel`**: The `StreamApiModel` hands the stream to `StreamManageModel.start()`.
    *   `StreamManageModel` assigns a unique `streamId`.
    *   It calls `stream.start(streamId)`.
4.  **`LiveStreamModel` (FFmpeg Execution)**:
    *   It connects to the mirakurun API to start receiving the raw broadcast TS stream for the specified `channelId`.
    *   It parses the FFmpeg `cmd` string, replacing template variables.
    *   It spawns the FFmpeg child process.
    *   It pipes the incoming TS stream from mirakurun directly into the FFmpeg process's `stdin`.

### 3.2. Data Relay and Playlists

*   **Piped Streams (MP4, WebM):**
    For formats designed to be played directly or via external apps, the API layer acts as a proxy. The `stdout` of the FFmpeg process is piped directly into the Express HTTP response object.

    *URL Scheme Wrapper:* If a user selects "Open in External App" for MP4 or WebM, EPGStation automatically serves an `.m3u8` playlist wrapper. The `/api/streams/live/:channelId/:format/playlist` endpoint generates an M3U8 file containing a single continuous segment pointing back to the raw piped stream URL. This ensures broad compatibility with players like VLC on mobile devices that rely heavily on playlists.

*   **HLS Streams:**
    For HLS, FFmpeg writes `.ts` segments and a `.m3u8` playlist directly to the disk (in the `stream` directory). EPGStation serves these static files via an Express static file route.

### 3.3. Resource Management and Throttling

*   **Stream Tracking:** `StreamManageModel` tracks all active streams in an internal dictionary (`this.streams`).
*   **Socket.IO Updates:** When a stream starts or stops, `StreamManageModel` notifies all connected clients via Socket.IO so the UI can update the active streams list.
*   **Offline Encode Throttling:** Live streaming is highly resource-intensive. To prevent CPU/GPU starvation, EPGStation integrates stream state awareness into the background offline encoding queue.
    *   When a stream starts or stops, an `IStreamEvent` is emitted.
    *   `EncodeManageModel` listens to this event.
    *   Before pulling a new background encode job from the `waitQueue` into the `runningQueue`, it checks `StreamManageModel.getStreamInfos()`.
    *   **If any live streams are active, new background encodes are temporarily blocked from starting.** They remain queued until all live streams are stopped.

## 4. Frontend Client Architecture

The frontend is built with Vue 2.

### 4.1. Selecting a Stream

*   **Component:** `client/src/components/onair/OnAirSelectStream.vue`
*   **State:** `client/src/model/state/onair/OnAirSelectStreamState.ts`

When a user clicks a channel to view it live, the `OnAirSelectStream` dialog opens.
1.  **Type Extraction:** The state model reads `config.yml` (provided via the API's server config endpoint) and extracts the available stream types (M2TS, MP4, HLS, etc.) and their specific presets ("720p", "480p").
2.  **External App Toggle:** A switch allows the user to opt into using an OS-level URL scheme (e.g., `vlc-x-callback://`).
    *   When toggled, the state model intelligently preserves the user's selected format (e.g., MP4) if it's supported by the URL scheme router.
3.  **URL Generation:**
    *   If using an in-browser player, it routes to `/onair/watch`.
    *   If using a URL scheme, `getStreamURL()` and `getPlayListURL()` dynamically generate the appropriate API endpoint URL, inject it into the `vlc://` string, and triggers `location.href` to launch the external application.

### 4.2. In-Browser Playback

*   **Component:** `client/src/components/onair/watch/OnAirWatchVideo.vue`
*   **Player Wrapping:** EPGStation utilizes different wrapper libraries depending on the format:
    *   **MP4:** Uses `dplayer` or direct `<video>` element with MSE if needed.
    *   **HLS:** Uses `hls.js` to parse the playlist and segments.
    *   **M2TS-LL:** Uses `mpegts.js`.
