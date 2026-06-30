# Rule Management Improvements

## Table of Contents
1. [Current State](#current-state)
2. [Product Requirements Document (PRD)](#product-requirements-document-prd)
3. [Technical Design Document](#technical-design-document)

## Current State

This section outlines how Rule Management currently works in EPGStation, including the front-end UI, API calls, back-end Node.js program, and database structure.

### 1. Front-end UI (Vue.js)
- **Component & View**: The main rule management UI is located in `client/src/views/Rule.vue` and `client/src/components/rules/`.
- **State Management**: Rule data is managed by `client/src/model/state/rule/IRuleState.ts`, which fetches data via the API and keeps track of selections, pagination, and multi-deletions.
- **Rendering**: The `RuleItems.vue` component renders the list of rules. It receives the rules sequentially from the state, matching the order returned by the API.
- **Filtering**: Currently, filtering on the frontend is mostly restricted to keyword searches (`RuleSearchMenu.vue`), triggering an API call with the `keyword` parameter.

### 2. Backend API
- **API Models**: The frontend calls `IRepositoryModel` to access the REST endpoints. For rules, this includes:
  - `GET /api/rules`: Retrieves a list of rules (`option: apid.GetRuleOption` handles `offset`, `limit`, and `keyword`).
  - `GET /api/rules/{id}`: Retrieves a specific rule.
  - `POST /api/rules`: Adds a new rule.
  - `PUT /api/rules/{id}`: Updates an existing rule entirely.
  - `PUT /api/rules/{id}/enable` / `disable`: Toggles rule status.
  - `DELETE /api/rules/{id}`: Deletes a rule.
- **IPC Mechanism**: The backend API (`src/model/api/rule/RuleApiModel.ts`) communicates with the Core logic (`src/model/operator/rule/RuleManageModel.ts`) via Inter-Process Communication (IPC).

### 3. Backend Logic & Database
- **TypeORM**: Rules are stored in SQLite/MySQL via TypeORM (`src/model/db/RuleDB.ts`).
- **Data Model**: The `Rule` table (`src/model/db/entities/Rule.ts`) stores:
  - Search Options: `keyword`, `ignoreKeyword`, `channelIds`, `genres`, etc.
  - Reserve Options: `enable`, `allowEndLack`, `avoidDuplicate`.
  - Save & Encode Options: `directory`, `recordedFormat`, `encodeOption`.
- **Ordering**: Currently, rules are inherently ordered by their insertion ID (the `id` primary key) because `findAll` fetches rules incrementally using `offset` and `limit`, without any explicit `ORDER BY` clause for priority.
- **Evaluation**: The recording engine evaluates rules sequentially based on their `id`. This means newly added rules (which get higher IDs) are evaluated last, functioning effectively as lower priority catch-alls.

### 4. Configuration (`config.yml`)
- The `config.yml` provides predefined encoding presets (under `encode:`) and default directories. However, there is no native way to bulk apply these existing configuration presets to multiple saved rules.

## Product Requirements Document (PRD)

### Problem Statement
Managing recording rules in EPGStation becomes increasingly difficult as the number of rules grows. The lack of priority reordering, rule conflict detection, bulk editing, and advanced filtering leads to a tedious, manual maintenance process for users.

### Pain Points & Proposed Features

#### 1. Priority Management (Reordering)
- **Pain Point**: Rules are matched sequentially from first to last (by ID), and new rules are appended to the end. Specific rules must be manually placed at the beginning and catch-all regex rules at the end. Currently, changing this order requires external scripting to dump, reorder, and overwrite the entire ruleset.
- **Goal**: Implement priority management allowing users to move rule priority up/down, to the highest priority, or to the lowest priority directly within the UI.
- **Requirement**: The system must support moving a single rule or multiple rules relative to their positions or to absolute ends of the queue without destroying the ruleset.

#### 2. Conflict and Similarity Detection
- **Pain Point**: It is hard to identify duplicate, overlapping, or conflicting rules (e.g., identical keywords or same specific program vs. broad catch-all).
- **Goal**: Provide a mechanism to detect and report similar or conflicting rules.
- **Requirement**: Provide a helper script/tool to analyze the rules database against current programs and past reservations to generate a report of potential improvements and overlaps.

#### 3. Bulk Editing Settings
- **Pain Point**: Updating multiple rules manually is painful, especially when applying a new encoding preset or updating directory structures.
- **Goal**: Introduce a bulk-edit feature allowing multiple rules to be updated simultaneously.
- **Requirements**:
  - **3.1 Bulk Shift Priorities**: Select multiple rules and send them to the top or bottom, keeping their relative order intact.
  - **3.2 Bulk Change Encoding Preset**: Apply an encoding preset (from `config.yml`) to all selected rules.
  - **3.3 Bulk Change Directory**: Update the destination directory for raw recordings and encodings across selected rules.

#### 4. Advanced Filtering
- **Pain Point**: The UI only filters by keyword search, making it hard to find rules for bulk editing.
- **Goal**: Enhance the rule list filtering capabilities.
- **Requirements**: Support filtering by:
  - 4.1 Encoding preset used.
  - 4.2 Channel specification (inclusive existence).
  - 4.3 Broadcast type (GR/BS/CS/SKY).
  - 4.4 Genre specification (inclusive existence).
  - 4.5 Save/Encode Directory keywords.

## Technical Design Document

This section outlines technical approaches for resolving the issues mentioned in the PRD.

### 1. Priority Management & Reordering (Backend & Frontend)

To implement rule reordering, we must disconnect execution order from the insertion `id` and introduce a new `priority` column.

**Database Changes:**
- Add a `priority` (integer) column to the `Rule` table.
- A migration script must initialize existing rules with `priority = id` to maintain current behavior.

**API Changes:**
- **GET `/api/rules`**: Update `RuleDB.findAll` to use `.orderBy('rule.priority', 'ASC')` instead of relying on default ID ordering.
- **PUT `/api/rules/priorities` (New Endpoint)**: A highly optimized bulk-update endpoint to handle reordering without needing to send full rule payloads.
  - Request body: `{ ruleIds: apid.RuleId[], position: 'top' | 'bottom' | 'up' | 'down' }` or a direct mapping of `[{ id: 1, priority: 2 }, ...]`.
  - The TypeORM backend (`RuleDB.ts`) should execute a single bulk `UPDATE` or use a transaction to efficiently rewrite priority integers for all affected rows, thereby avoiding SQLITE_BUSY locks.

**Frontend UI:**
- In `RuleItems.vue`, introduce drag-and-drop handles for individual moving, and add "Move to Top", "Move to Bottom" buttons to the multi-select action bar.

### 2. Conflict/Similarity Detection (Native TypeScript Analyzer)

Instead of a heavy UI integration right away, we will provide a standalone Node.js script. A simple SQL query or Python script is insufficient because EPGStation has a highly customized search matching engine (handling regex flags, half-width/full-width conversion, time constraints, genre sub-types). 

By writing a TypeScript script that bootstraps EPGStation's internal dependency injection (`ModelContainer`), we can fetch all rules and pass them natively through `ProgramDB.findRule()`. This provides 100% accuracy in showing which upcoming programs overlap.

**`src/test/scripts/rule_analyzer.ts`**
```typescript
import 'reflect-metadata';
import { install } from 'source-map-support';
import * as containerSetter from '../../model/ModelContainerSetter';
import container from '../../model/ModelContainer';
import IConfiguration from '../../model/IConfiguration';
import ILoggerModel from '../../model/ILoggerModel';
import IDBOperator from '../../model/db/IDBOperator';
import IRuleDB from '../../model/db/IRuleDB';
import IProgramDB from '../../model/db/IProgramDB';

// Need to load the internal entities correctly or else Metadata errors happen
import '../../db/entities/Rule';
import '../../db/entities/Program';
import * as apid from '../../../api';

// Need to load the internal entities correctly or else Metadata errors happen
import '../../db/entities/Rule';
import '../../db/entities/Program';

// Need to load the internal entities correctly or else Metadata errors happen
import '../../db/entities/Rule';
import '../../db/entities/Program';

// Need to load the internal entities correctly or else Metadata errors happen
import '../../db/entities/Rule';
import '../../db/entities/Program';

install();

async function analyzeRules() {
    containerSetter.set(container);
    container.get<ILoggerModel>('ILoggerModel').initialize();
    container.get<IConfiguration>('IConfiguration').getConfig();

    const dbOp = container.get<IDBOperator>('IDBOperator');
    const ruleDB = container.get<IRuleDB>('IRuleDB');
    const programDB = container.get<IProgramDB>('IProgramDB');

    try {
        await dbOp.getConnection();

        const [rules, totalRules] = await ruleDB.findAll({ limit: 1000 });
        console.log(`Fetched ${totalRules} rules from database.`);
        const activeRules = (rules as apid.Rule[]).filter(r => r.reserveOption.enable && !r.isTimeSpecification);

        const programToRules: { [programId: number]: apid.Rule[] } = {};

        // Execute exact EPGStation search logic
        for (const rule of activeRules) {
            const matchedPrograms = await programDB.findRule({
                searchOption: rule.searchOption,
                reserveOption: rule.reserveOption,
            });

            for (const program of matchedPrograms) {
                if (!programToRules[program.id]) programToRules[program.id] = [];
                programToRules[program.id].push(rule);
            }
        }

        console.log("\n--- Rule Conflict & Overlap Report ---");
        for (const [programIdStr, matchedRules] of Object.entries(programToRules)) {
            if (matchedRules.length > 1) {
                const programId = parseInt(programIdStr, 10);
                const programData = await programDB.findId(programId);
                console.log(`\nProgram: ${programData ? programData.name : programId}`);
                console.log(`Matched by ${matchedRules.length} rules:`);
                
                // Sort by ID to see which rule actually wins execution priority
                matchedRules.sort((a, b) => a.id - b.id).forEach((r, idx) => {
                    const status = idx === 0 ? "(Will Record)" : "(Ignored/Conflict)";
                    console.log(`  - Rule ID ${r.id}: '${r.searchOption.keyword || '<No Keyword>'}' ${status}`);
                });
            }
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await dbOp.closeConnection();
        process.exit(0);
    }
}

analyzeRules();
```
This script acts as a diagnostic tool. To run it without compilation errors against the production database, ensure you use EPGStation's native `tsconfig.json` compiler options:
```bash
npm run compile
NODE_ENV=production node dist/test/scripts/rule_analyzer.js
```
By seeing which programs are caught by multiple rules, a user can safely tune their rules or adjust priorities before we implement a full bulk-edit UI.

### 3. Bulk Editing (Backend & Frontend)

**API Changes:**
- **PUT `/api/rules/bulk` (New Endpoint)**: An endpoint designed to patch multiple rules.
  - Request body: `{ ruleIds: number[], encodeOption?: ReserveEncodedOption, directory?: string }`
  - Implementation in `RuleManageModel.ts`: Retrieve the affected rules, merge the incoming patched properties, and batch update via `ruleDB`.

**Frontend UI:**
- Introduce a `RuleBulkEditDialog.vue` component, accessible when multiple rules are selected in `Rule.vue`.
- Expose dropdowns populated from `config.yml` (via `GET /api/config`) to select standardized encoding presets and directories.

### 4. Advanced Filtering (Backend API Extension)

Doing filtering purely on the Vue frontend requires fetching *all* rules, which is inefficient. We must extend the existing `GET /api/rules` endpoint and `GetRuleOption` interface.

**API Changes:**
- Extend `GetRuleOption` in `api.d.ts`:
  ```typescript
  export interface GetRuleOption {
      offset?: number;
      limit?: number;
      keyword?: string;
      encodePreset?: string;      // 4.1
      channelId?: apid.ChannelId; // 4.2
      broadcastType?: string;     // 4.3 (GR, BS, CS)
      genre?: apid.Genre;         // 4.4
      directory?: string;         // 4.5
  }
  ```
- **Backend `RuleDB.ts` Modification**: Add TypeORM `queryBuilder.andWhere` clauses dynamically if these new parameters are present in `GetRuleOption`.
  - For `encodePreset` / `directory`, use `LIKE '%preset_name%'` parsing the JSON-encoded `encodeOption` column, or query the specific JSON path (depending on MySQL vs SQLite capabilities).
  - For channels and genres, handle the serialized JSON arrays appropriately in the `WHERE` clauses.

**Frontend UI:**
- Expand the `RuleSearchMenu.vue` panel to include multi-select dropdowns for Channels, Genres, Broadcast Types, and simple text inputs for directories/presets.
- When applying the filter, these fields are passed to the `IRuleState.ts` fetch options, making the backend return the correctly filtered page list natively.
