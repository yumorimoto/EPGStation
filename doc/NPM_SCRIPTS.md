# NPM Scripts Guide

This document explains the various `npm run` targets available in the EPGStation repository. By understanding what each script does, you can optimize your development workflow and reduce unnecessary compilation time.

## Workflow Optimization

A common question during development is: **"When I update code, do I need to run `npm run build` or just `npm run compile`?"**

The answer depends on what you have modified:

* **Backend Changes ONLY (modifying files outside the `client/` folder):**
  You **only** need to run `npm run compile` to update the server. You can bypass the frontend build completely, which saves a significant amount of time.
  Alternatively, you can use `npm run build-server` if you also want to format and lint your backend code before compiling.

* **Frontend Changes ONLY (modifying files inside the `client/` folder):**
  You **only** need to run `npm run build-client`. This uses Vue CLI to bundle the Vue.js components.

* **Changes to both Backend and Frontend:**
  You must run the full `npm run build` command, which sequentially runs both the server and client builds.

## Available NPM Scripts

Below is a complete list of `package.json` scripts and their specific use cases:

### Setup & Installation
* **`npm run all-install`**
  * **Description:** Installs standard dependencies for both the root (server) project and the `client/` (frontend) project concurrently.
  * **Use Case:** Initial project setup, or after a major `git pull` that might have altered dependencies.

### Running the App
* **`npm run start`**
  * **Description:** Starts the EPGStation backend server node process (`node dist/index.js`).
  * **Use Case:** Used to launch the application after it has been built.

### Building & Compilation
* **`npm run build`**
  * **Description:** The primary build command. It triggers both `npm run build-server` and `npm run build-client` sequentially.
  * **Use Case:** Creating a complete production-ready bundle of the entire application.
* **`npm run build-server`**
  * **Description:** Formats the source code, lints it, and then compiles the backend TypeScript.
  * **Use Case:** Preparing the backend for production, ensuring all code meets style guidelines before transpiling.
* **`npm run build-client`**
  * **Description:** Navigates into the `client/` directory, automatically updates the Browserslist Database, and executes Vue CLI's build script.
  * **Use Case:** Building static frontend assets to be served by the backend.
* **`npm run compile`**
  * **Description:** Runs the TypeScript Compiler (`tsc`) on the backend source code to generate `dist/`.
  * **Use Case:** The fastest way to apply backend modifications without the overhead of formatting or linting.
* **`npm run watch`**
  * **Description:** Runs the TypeScript Compiler in watch mode (`tsc --watch`).
  * **Use Case:** Very useful during active backend development. It automatically recompiles your TypeScript files into JavaScript instantly whenever you save a file.

### Formatting & Linting
* **`npm run lint`**
  * **Description:** Runs ESLint to find and fix basic problems in the backend TypeScript code (`src/`).
  * **Use Case:** Checking for potential errors and enforcing code quality standards.
* **`npm run format`**
  * **Description:** Runs Prettier to automatically re-format backend TypeScript code to adhere to style guidelines.
  * **Use Case:** Making code style consistent before submitting changes.

### Database Utilities
* **`npm run orm-gen`**
  * **Description:** Generates new TypeORM migrations. (Note: relies on specific npm config variables).
  * **Use Case:** Used by developers when they alter TypeORM entity models and need to generate a new SQL migration file.
* **`npm run orm-run`**
  * **Description:** Applies pending TypeORM migrations to the active database.
  * **Use Case:** Updating the database schema.
* **`npm run backup`**
  * **Description:** Triggers the EPGStation database backup script.
  * **Use Case:** Creating a safe snapshot of your recordings and configurations.
* **`npm run restore`**
  * **Description:** Triggers the EPGStation database restore script.
  * **Use Case:** Restoring data from a previously created backup.
* **`npm run v1migrate`**
  * **Description:** Runs the tool designed to migrate a database from EPGStation v1 to v2.
  * **Use Case:** Upgrading old EPGStation installations.

### Service Management (Windows Only)
* **`npm run install-win-service`** / **`npm run uninstall-win-service`**
  * **Description:** Registers or removes EPGStation as a native Windows Service using `winser`.
  * **Use Case:** Only relevant for users deploying EPGStation on Windows environments who want it to run continuously in the background.
