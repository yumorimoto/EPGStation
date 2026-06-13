# URL Scheme and Stream Behavior

## Original Behavior (Before Changes)

In EPGStation's original setup, the "Open in external app" (`外部アプリで開く`) feature was strongly coupled to the **M2TS** stream format.

1.  **Frontend State (`OnAirSelectStreamState.ts`):**
    *   The `useURLScheme` boolean mapped directly to exposing the `M2TS` stream type in the stream selection dialog.
    *   If `useURLScheme` was true, the only valid option was `M2TS`. It populated the format dropdown with `config.streamConfig.live.ts.m2ts.map(c => c.name)`.
    *   If `useURLScheme` was false, the dialog offered web-playable streams like `M2TS-LL`, `WebM`, `MP4`, and `HLS`.
    *   The UI toggle (switch) defaulted to whatever the user last saved in local storage.

2.  **Playlist Generation (`OnAirSelectStreamState.ts` -> Backend):**
    *   When the user clicked "Watch" (`視聴`) with "Open in external app" checked, the Vue component (`OnAirSelectStream.vue`) called `dialogState.getStreamURL()`.
    *   If no explicit `urlscheme` string was found (e.g., on Desktop without VLC schema set), it gracefully fell back to downloading a playlist via `dialogState.getPlayListURL()`.
    *   `getPlayListURL()` historically hardcoded `m2ts` in the path: `/api/streams/live/${channelId}/m2ts/playlist?mode=${mode}`.
    *   The backend (Express/`StreamApiModel.ts`) only officially exported `getLiveM2TSPlayList` to handle building the `.m3u8` response wrapper for M2TS streams.

## The Bug / Unintended Consequence

When we attempted to expand "Open in external app" to support `MP4` and `WebM`:

1.  **Frontend Mapping Error:** The config schema definition of `config.streamConfig.live.ts.mp4` changed or we made a faulty assumption about its shape. If it's returning objects (e.g., `{ name: '720p', cmd: '...' }`), `.map(c => c.name)` is correct. If it's returning strings, it's incorrect. Our refactoring attempted to assign `config.streamConfig.live.ts.mp4` directly to the `streamConfig` dictionary without mapping `.name`, which caused the dropdown options to become objects rather than readable strings, breaking the UI when `useURLScheme` is disabled.
2.  **Default UI State:** When `useURLScheme` is toggled off, `M2TS` disappears entirely from the available types because we strictly segregated it: `M2TS` is *only* available when `useURLScheme` is true. `M2TS-LL` is *only* available when false. If the saved `type` was M2TS but `useURLScheme` was flipped to false, the system attempts to auto-select `M2TS-LL` but fails gracefully, resulting in the erratic UI behavior.
3.  **Playlist Route Not Found:** We updated `getPlayListURL()` to dynamically insert `mp4`: `/api/streams/live/${channelId}/mp4/playlist?mode=${mode}`. However, the backend routing does not have an endpoint configured to catch `mp4/playlist`. Therefore, the browser receives a 404 Not Found when attempting to download the playlist.

## Proposed Fixes

1.  **Revert Frontend Segregation (`OnAirSelectStreamState.ts`):**
    *   Do not conditionally hide stream types based on `useURLScheme`.
    *   Always populate `streamTypes` and `streamConfig` with all available formats (`M2TS`, `M2TS-LL`, `WebM`, `MP4`, `HLS`).
    *   When "Open in external app" is clicked, check if the *selected format* has a valid URL scheme or backend playlist endpoint. If not, maybe disable the toggle or show a warning. (However, keeping it simple: just let the user toggle it regardless of format).
2.  **Fix Backend Playlist Endpoints (`StreamApiModel.ts` & `src/api/stream/live.ts`):**
    *   Create a generic `/api/streams/live/:channelId/:type/playlist` endpoint.
    *   This endpoint should generate an M3U8 payload formatted properly for *any* type (`m2ts`, `mp4`, `webm`).
    *   Format:
        ```
        #EXTM3U
        #EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}",${channel.name}
        http://${host}/api/streams/live/${channel.id}/${type}?mode=${mode}
        ```
