# EPGStation UI Migration Analysis: Vue 3 vs. Svelte

This document outlines the estimation, impacted codebase, and associated risks for migrating the current Vue 2 EPGStation client to either **Vue 3** or **Svelte**. The application needs to remain a lean, responsive web application capable of running on desktop, tablet, and mobile devices.

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

## Option 1: Upgrading to Vue 3

This path involves upgrading the existing ecosystem to modern Vue standards while retaining the core framework identity.

### Target Architecture
- **Framework:** Vue 3 (Composition API / `<script setup>`)
- **State Management:** Pinia (Replacing InversifyJS)
- **UI Library:** Vuetify 3
- **Build Tool:** Vite (Replacing Vue CLI/Webpack)

### Amount of Code Impacted
**High (80-90% of the frontend codebase)**
- **Templates:** Moderate impact. Vuetify 3 changed many component names, prop signatures, and grid system mechanics compared to Vuetify 2.
- **Scripts:** Total rewrite. Moving from Vue Class Components (`vue-property-decorator`) to the Vue 3 Composition API requires a complete restructuring of the `<script>` blocks in all 99 `.vue` files.
- **State/Models:** Total rewrite. The 140+ `.ts` files managing DI via Inversify must be refactored into Pinia stores. This shifts the paradigm from strict OOP dependency injection to functional, reactive stores.

### Effort Estimation
**Large (Approx. 4-6 Weeks for a single developer)**
- Refactoring class components to Composition API is tedious but straightforward.
- The largest time sink will be untangling InversifyJS models and rebuilding them as Pinia stores, ensuring reactivity works correctly within Vue 3.
- Fixing Vuetify 3 breaking changes across complex components (like the EPG Guide/Timeline).

### Risks
- **Vuetify 3 Feature Parity:** Vuetify 3 is stable but some niche components or API features from v2 might require workarounds or behave differently (e.g., Data Tables, Date Pickers).
- **Reactivity Bugs:** Moving from Inversify (which likely tracks state mutability manually or via event emitters) to Pinia's Proxy-based reactivity could introduce subtle UI update bugs if not carefully architected.

---

## Option 2: Migrating to Svelte (Svelte 5)

This path involves abandoning the Vue ecosystem for Svelte, a compiler-based framework known for producing highly optimized, lean vanilla JavaScript, ideal for cross-platform responsive web apps.

### Target Architecture
- **Framework:** Svelte 5 (utilizing Runes for reactivity)
- **State Management:** Svelte Runes (e.g., `$state`, `$derived`) and standard Svelte Context/Stores.
- **UI Library:** Svelte Material UI (SMUI) or a modern alternative like Skeleton (Tailwind-based) if strict Material Design isn't enforced.
- **Build Tool:** SvelteKit (configured for SPA/Static output via `adapter-static`) or Vite + Svelte.

### Amount of Code Impacted
**Total (100% of the frontend codebase)**
- **Templates:** Complete rewrite. Vue template syntax (`v-if`, `v-for`, `v-bind`) must be translated to Svelte logic blocks (`{#if}`, `{#each}`).
- **Scripts:** Complete rewrite. Vue components will be translated into Svelte's `<script>` tags using Runes.
- **State/Models:** Complete rewrite. Inversify models will be converted into standalone `.ts` files exporting Svelte Runes state or standard Svelte writable stores.

### Effort Estimation
**Extra Large (Approx. 6-8 Weeks for a single developer)**
- While Svelte's syntax is closer to vanilla HTML/JS and arguably faster to write, *every single line of UI code* must be rewritten.
- Translating Vuetify components to Svelte Material UI (SMUI) is not 1:1. SMUI components have different APIs, layout behaviors, and DOM structures. Recreating complex custom components like the EPG Guide grid will require significant CSS and DOM manipulation effort.

### Risks
- **Learning Curve:** Transitioning from Vue OOP to Svelte's functional/reactive paradigm.
- **UI Component Library Limitations:** SMUI is robust but generally has a smaller ecosystem and fewer pre-built complex data components compared to Vuetify. Achieving the exact same visual polish and responsive behavior for the EPG grid might require writing custom CSS/JS.
- **Complete Rebuild:** A 100% rewrite carries the inherent risk of missing edge-case business logic hidden in the legacy Inversify models.

---

## Summary & Recommendation

| Feature | Vue 3 Path | Svelte Path |
| :--- | :--- | :--- |
| **Effort** | High (Refactoring) | Very High (Complete Rewrite) |
| **Performance** | Excellent (Vue 3 is highly optimized) | Unmatched (Svelte compiles to vanilla JS, lowest bundle size) |
| **State Management** | Pinia (Standard, excellent DevTools) | Svelte Runes (Built-in, zero-dependency) |
| **UI Library** | Vuetify 3 (Familiar visual language) | SMUI (Requires relearning component APIs) |

**Recommendation:**
For a lean website running across devices, **Svelte** provides the absolute best performance and smallest bundle sizes. However, because the current app heavily leverages Vuetify and Inversify, the **Vue 3 upgrade is the more pragmatic choice**. It offers an iterative path (you can migrate files one by one conceptually) and retains familiarity with the Material UI structure provided by Vuetify, even with the required refactor to Pinia and the Composition API.

If bundle size and absolute maximum rendering performance on low-end mobile devices are the absolute top priorities, and you are willing to invest in a complete rewrite, **Svelte 5 with Runes** is the superior modern architecture.

---

## Additional Considerations

### 1. Decoupling the Web UI from Core EPGStation
**Feasibility: Very High (Already Decoupled by Design)**
The current Web UI is already a Single Page Application (SPA) that communicates with the core backend almost entirely via REST/WebSockets (as defined in `api.yml`).
Because the frontend and backend are logically separated:
- You do not need to modify the core Node.js backend to build a new UI.
- Any new framework (Vue 3, Svelte, React) can simply import the existing API specifications and make network requests exactly as the current client does.

### 2. Coexistence of Legacy and New UI During Development
**Feasibility: Very High**
Because the UI is decoupled from the core business logic, it is very easy to run the legacy Vue 2 UI alongside a new framework during development:
- **Development Mode:** You can run the legacy UI via `npm run watch` (e.g., on `localhost:8888`) while simultaneously running a Vite/Svelte development server (e.g., on `localhost:5173`). Both clients can communicate with the same running EPGStation backend API.
- **Production Mode:** You could configure the EPGStation backend (or a reverse proxy like Nginx) to serve the legacy UI at the root path (`/`) and the new UI at a sub-path (e.g., `/v2/` or `/next/`), allowing users to test the new UI without losing access to the stable version.

### 3. Minimum Viable Migration (Vue 2 -> Vue 3 Only)
If the goal is strictly to migrate off the End-of-Life (EOL) Vue 2 with the absolute minimum amount of effort, while retaining the current architecture (OOP Class Components and Inversify), the path looks like this:

**The "Low-Hanging Fruit" Path:**
1. **Upgrade to Vue 3:** Swap Vue 2.7 for Vue 3.
2. **Swap Decorators:** The official `vue-class-component` and `vue-property-decorator` do not officially support Vue 3. You would need to swap them for community alternatives like `vue-facing-decorator`. This allows you to keep your existing `@Component` and `@Prop` syntax with minimal refactoring.
3. **Retain Inversify:** Since Inversify is just a vanilla TypeScript DI container, it is completely framework agnostic. You can continue using it in Vue 3 exactly as you do now, bypassing the need to rewrite 140+ files into Pinia stores.
4. **Upgrade Vuetify:** You *must* upgrade to Vuetify 3, as Vuetify 2 does not support Vue 3. This will still be the largest chunk of work, as Vuetify 3 has breaking changes regarding grid layouts, component names, and prop signatures.
5. **Modernize Build Tool (Optional but Recommended):** Migrate from Vue CLI (Webpack) to Vite to significantly improve build times and developer experience.

**Summary of Minimum Path:**
- **Code Impacted:** ~30-40% (Mainly template changes for Vuetify 3 and minor `<script>` changes to use new decorators).
- **Effort:** Medium. You save weeks of time by not rewriting the Inversify state models or converting classes to the Composition API, but you still face the Vuetify 3 breaking changes.
