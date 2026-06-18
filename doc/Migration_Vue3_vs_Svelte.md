# EPGStation UI Migration Analysis: Vue 3 vs. Svelte

This document outlines the estimation, impacted codebase, and associated risks for migrating the current Vue 2 EPGStation client to modern frameworks. The application needs to remain a lean, responsive web application capable of running on desktop, tablet, and mobile devices.

## Current Architecture State

The current client (`client/src/`) consists of approximately:
- **99 Vue components** (`.vue` files)
- **146 TypeScript files** (`.ts` files)
- **Key Technologies:**
  - **Vue 2** (End-of-Life)
  - **Vue Class Components / Property Decorator:** Heavy reliance on OOP-style component definitions (`@Component`, `@Prop`, `@Watch`).
  - **Vuetify 2:** Extensive use of Vuetify components for UI styling and layout.
  - **InversifyJS:** Used for Dependency Injection (DI) to manage state and business logic models (e.g., `container.get<IChannelModel>`), bypassing standard Vue state management like Vuex.
  - **Webpack / Vue CLI:** Current build pipeline.

---

## Option 1: Minimum Viable Migration (Vue 2 -> Vue 3 Only)

If the goal is strictly to migrate off the End-of-Life (EOL) Vue 2 with the absolute minimum amount of effort, while retaining the current architecture (OOP Class Components and Inversify), this is the path.

### Target Architecture
- **Framework:** Vue 3
- **State Management:** InversifyJS (Retained)
- **UI Library:** Vuetify 3
- **Decorators:** `vue-facing-decorator` (Replacing `vue-property-decorator`)

### Amount of Code Impacted
**Medium (~30-40% of the frontend codebase)**
- **Templates:** Moderate impact. Vuetify 3 changed many component names, prop signatures, and grid system mechanics compared to Vuetify 2.
- **Scripts:** Minor impact. You would swap import statements to use `vue-facing-decorator` to maintain the existing `@Component` syntax.
- **State/Models:** No impact. Inversify is framework agnostic and can remain as-is.

### Effort Estimation
**Medium (Approx. 2-3 Weeks for a single developer)**
- You save weeks of time by not rewriting the Inversify state models or converting classes to the Composition API.
- The largest chunk of work remains upgrading to Vuetify 3, which has breaking layout and API changes.

### Risks
- **Technical Debt:** You remain tied to Class Components, which are no longer the standard or recommended path in the Vue 3 ecosystem.

---

## Option 2: Full Upgrade to Modern Vue 3

This path involves upgrading the existing ecosystem to modern Vue standards while retaining the core framework identity.

### Target Architecture
- **Framework:** Vue 3 (Composition API / `<script setup>`)
- **State Management:** Pinia (Replacing InversifyJS)
- **UI Library:** Vuetify 3
- **Build Tool:** Vite (Replacing Vue CLI/Webpack)

### Amount of Code Impacted
**High (80-90% of the frontend codebase)**
- **Templates:** Moderate impact (Vuetify 3 changes).
- **Scripts:** Total rewrite. Moving from Vue Class Components to the Vue 3 Composition API requires a complete restructuring of the `<script>` blocks in all 99 `.vue` files.
- **State/Models:** Total rewrite. The 140+ `.ts` files managing DI via Inversify must be refactored into Pinia stores.

### Effort Estimation
**Large (Approx. 4-6 Weeks for a single developer)**
- Untangling InversifyJS models and rebuilding them as Pinia stores ensuring reactivity works correctly within Vue 3 will be highly time-consuming.
- Fixing Vuetify 3 breaking changes across complex components (like the EPG Guide/Timeline).

### Risks
- **Reactivity Bugs:** Moving from Inversify to Pinia's Proxy-based reactivity could introduce subtle UI update bugs if not carefully architected.

---

## Option 3: Migrating to Svelte (Svelte 5)

This path involves abandoning the Vue ecosystem for Svelte, a compiler-based framework known for producing highly optimized, lean vanilla JavaScript, ideal for cross-platform responsive web apps.

### Target Architecture
- **Framework:** Svelte 5 (utilizing Runes for reactivity)
- **State Management:** Svelte Runes (e.g., `$state`, `$derived`) and standard Svelte Context/Stores.
- **UI Library:** Svelte Material UI (SMUI) or a modern alternative like Skeleton (Tailwind-based).
- **Build Tool:** SvelteKit (configured for SPA/Static output) or Vite + Svelte.

### Amount of Code Impacted
**Total (100% of the frontend codebase)**
- **Templates:** Complete rewrite. Vue template syntax must be translated to Svelte logic blocks.
- **Scripts:** Complete rewrite to Svelte `<script>` tags using Runes.
- **State/Models:** Complete rewrite to Svelte Runes state or standard Svelte writable stores.

### Effort Estimation
**Extra Large (Approx. 6-8 Weeks for a single developer)**
- *Every single line of UI code* must be rewritten.
- Translating Vuetify components to Svelte Material UI (SMUI) is not 1:1. Recreating complex custom components like the EPG Guide grid will require significant CSS and DOM manipulation effort.

### Risks
- **Learning Curve:** Transitioning from Vue OOP to Svelte's functional/reactive paradigm.
- **UI Component Library Limitations:** SMUI has a smaller ecosystem than Vuetify. Achieving exact visual parity for complex grids might require writing custom CSS/JS.

---

## Summary & Recommendation

| Feature | Option 1 (Min Viable Vue 3) | Option 2 (Modern Vue 3) | Option 3 (Svelte) |
| :--- | :--- | :--- | :--- |
| **Effort** | Medium (Vuetify Fixes) | High (Refactoring) | Very High (Complete Rewrite) |
| **Performance** | Good | Excellent | Unmatched (Lowest bundle size) |
| **State Management**| InversifyJS (Legacy) | Pinia (Standard) | Svelte Runes (Built-in) |
| **UI Library** | Vuetify 3 | Vuetify 3 | SMUI |

**Recommendation:**
For a lean website running across devices, **Svelte** provides the absolute best performance. However, because the current app heavily leverages Vuetify and Inversify, the **Minimum Viable Vue 3 upgrade (Option 1)** is the most pragmatic immediate choice to escape EOL status safely. If long-term maintainability is the goal, **Option 2 (Modern Vue 3)** strikes the best balance of effort vs modern standard adoption.

---

## Workflow & Development Decoupling

### Decoupling the Web UI from Core EPGStation
The current Web UI is already a Single Page Application (SPA) that communicates with the core backend almost entirely via REST/WebSockets.
You do not need to modify the core Node.js backend to build a new UI. Any new framework can simply import the existing API specifications and make network requests.

### Testing New UI Code Without Shutting Down the Backend
Because the frontend `client/` directory acts as a separate Node project, you can run the legacy backend and a new development UI simultaneously.

**Step 1: Start the Core Backend**
In the root directory, run the start command to launch the core server (e.g., on port `8888`), managing the database and exposing the API.

**Step 2: Configure the New UI to Proxy API Requests**
In your new UI framework (e.g., Vite), configure the dev server to proxy `/api` and `/socket.io` requests back to the backend.

Example `vite.config.js`:
```javascript
export default defineConfig({
  server: {
    port: 5173, // The Vite dev server port
    proxy: {
      '/api': {
        target: 'http://localhost:8888', // Core EPGStation backend
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'ws://localhost:8888', // WebSockets
        ws: true,
      }
    }
  }
});
```

**Step 3: Run the New UI Dev Server**
In a separate terminal, inside your new UI directory, run the dev server command.

You can now open `http://localhost:5173` to view the new UI hot-reloading while it pulls live data from the stable backend running on port `8888`. You never have to restart the Node.js backend unless changing core API logic. The legacy UI remains accessible at `http://localhost:8888`.

---

## The Svelte 5 Rebuild Strategy (Option 3 Deep Dive)

Given that migrating to Vuetify 3 essentially requires rewriting all templates anyway, moving to Svelte 5 is a highly logical choice to achieve long-term maintainability, superior performance, and much cleaner, boilerplate-free code.

### AI/Developer Comfort Level with Svelte 5
I am highly comfortable developing a Svelte 5 application from the ground up. Svelte 5's introduction of **Runes** (`$state`, `$derived`, `$effect`) maps extremely well to modern reactive programming patterns. Because Svelte compiles to vanilla JS and avoids complex Virtual DOM diffing, debugging and structuring data flow (especially for a data-heavy app like EPGStation) is actually much more straightforward than wrestling with Vue's reactivity proxies or Inversify decorators.

### The Most Challenging Component: The EPG Guide Table
You are entirely correct: **The main EPG Guide table is the most challenging and critical component to build.**
It should absolutely be the very first major UI piece tackled. Here is why:

1. **Virtualization & DOM Depth:** An EPG guide displaying hundreds of channels over 24+ hours generates massive amounts of DOM nodes. In Svelte, we will likely need to implement custom DOM virtualization (only rendering the programs currently visible in the viewport) to keep scrolling silky smooth on mobile devices.
2. **Absolute Positioning Math:** EPG grids are rarely standard CSS tables. Programs are usually absolutely positioned based on start/end timestamps calculated against a dynamic pixel-per-minute ratio.
3. **Continuous Time Sync:** The UI must display the current time line and automatically scroll/update as time passes without triggering a full page re-render.

If we can build a highly performant, virtualized Svelte EPG grid that fetches data from the backend, the rest of the application (lists, settings, basic forms) will be comparatively trivial.

### Recommended Phases for the Svelte 5 Rebuild

If we proceed with a parallel ground-up rebuild, here is the exact phased approach:

#### Phase 1: Foundation & Infrastructure (Week 1)
- **Setup:** Initialize a new Vite + Svelte 5 (or SvelteKit SPA) project in a new directory (e.g., `client-svelte/`).
- **Dev Proxy:** Configure `vite.config.js` to proxy `/api` and `/socket.io` to the running legacy backend.
- **API Client:** Port the core API communication layer. Generate or manually write the typed `fetch` wrappers for the REST API (translating the existing Axios/Inversify models to clean ES modules).
- **Global State:** Establish the basic Svelte Runes global state (e.g., User Config, Dark Mode, Server Status).

#### Phase 2: "The Crucible" - The EPG Guide (Weeks 2-3)
- **Data Fetching:** Implement the channel and schedule API calls.
- **The Grid System:** Build the CSS Grid or Absolute Positioning math for the timeline and channel headers.
- **Program Blocks:** Render individual program cards. Implement click handlers to open program detail dialogs.
- **Virtualization (If needed):** If rendering the full grid causes lag on mobile, implement an intersection observer or calculated windowing system to cull off-screen programs.

#### Phase 3: Live Video & Playback (Week 4)
- **Video Player Component:** Port the HLS/MPEG-TS video playback logic. This involves cleanly integrating `hls.js` or `mpegts.js` within Svelte's `onMount` and `$effect` lifecycles to ensure proper cleanup when components are destroyed.
- **Live Viewing:** Connect the video player to the channel selection from the EPG Guide.

#### Phase 4: Recorded Programs & Search (Week 5)
- **Recorded List:** Build the paginated lists for recorded shows. This involves standard Svelte `{#each}` blocks and is generally simple.
- **Search & Rules:** Implement the search forms, date pickers, and keyword inputs. Recreate the API payload builders to save new recording rules.

#### Phase 5: Settings & System Management (Week 6)
- **Settings UI:** Port the user preference toggles, server settings, and log viewing components.
- **WebSocket Integration:** Finalize the Socket.io connection to listen for real-time encode progress and system notifications, binding them to a global Svelte `$state` to trigger UI snackbars.

#### Phase 6: Polish & Cutover (Week 7)
- **Mobile Responsiveness:** Do a final sweep of CSS media queries and touch interactions.
- **Build & Serve:** Configure the `npm run build` process to output the Svelte static files to the correct directory so the core EPGStation backend serves the new UI by default in production.
