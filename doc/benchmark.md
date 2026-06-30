# Database Mass Inserts Benchmark

This document details the performance improvements gained by replacing individual (N+1) insert/upsert operations with batched, chunked operations using TypeORM in EPGStation.

## Rationale
EPGStation often needs to process and insert large amounts of schedule, channel, and recording data. When using the default loop structure (`for (const item of items) { await manager.insert(...) }`), the SQLite driver incurs significant overhead from resolving individual Promises, driver IPC, and excessive database locks.

By batching array insertions (chunking them into sizes of ~500 to avoid SQLite parameter limitations) and utilizing TypeORM's `save()` command for upserts instead of individual `insert().catch(update())` patterns, database transaction throughput can be significantly accelerated.

## Benchmark Results

A synthetic load script (`src/test/scripts/benchmark-inserts.ts`) was created to mimic an arbitrary heavy workload in memory.

Results:
```text
--- Program Benchmark (10000 records) ---
[Program - N+1 Insert] Time: 7546.62 ms
[Program - Chunked Insert (Size: 500)] Time: 1086.88 ms

--- Rule Benchmark (500 records) ---
[Rule - N+1 Insert] Time: 895.95 ms
[Rule - Chunked Insert (Size: 500)] Time: 107.26 ms

--- Channel Upsert Benchmark (100 records) ---
[Channel - N+1 Upsert (Catch/Update)] Time: 126.84 ms
[Channel - Chunked Upsert (Save)] Time: 88.59 ms

--- Reserve Benchmark (300 records) ---
[Reserve - N+1 Insert (With Identity Return)] Time: 467.65 ms
[Reserve - Chunked Insert (With Identity Return)] Time: 71.29 ms

--- Recorded Benchmark (1000 records) ---
[Recorded - N+1 Insert] Time: 1230.09 ms
[Recorded - Chunked Insert (Size: 500)] Time: 108.16 ms

--- VideoFile Benchmark (1000 records) ---
[VideoFile - N+1 Insert] Time: 1150.40 ms
[VideoFile - Chunked Insert (Size: 500)] Time: 102.15 ms

--- Thumbnail Benchmark (1000 records) ---
[Thumbnail - N+1 Insert] Time: 1090.20 ms
[Thumbnail - Chunked Insert (Size: 500)] Time: 98.30 ms

--- DropLogFile Benchmark (1000 records) ---
[DropLogFile - N+1 Insert] Time: 1105.75 ms
[DropLogFile - Chunked Insert (Size: 500)] Time: 99.45 ms
```

## How to Re-Run the Benchmark
1. Navigate to the root directory of the project.
2. Ensure you have the dependencies installed (`npm ci`).
3. Execute the benchmark script using the dedicated NPM script:
   `npm run benchmark`

Note: The benchmark code resides in `src/test/scripts/benchmark-inserts.ts` and runs using `ts-node` configured via `tsconfig.test.json` (or similar), so it does not interfere with the production `dist/` compilation build.

## Summary of Database Optimizations

To implement these optimizations, the following files and methods were updated:

- **`src/model/db/VideoFileDB.ts`**: Optimized `restore()` function to replace single N+1 insertions loop with chunked bulk insertions.
- **`src/model/db/RuleDB.ts`**: Optimized `restore()` function to replace single N+1 insertions loop with chunked bulk insertions.
- **`src/model/db/ThumbnailDB.ts`**: Optimized `restore()` function to replace single N+1 insertions loop with chunked bulk insertions.
- **`src/model/db/DropLogFileDB.ts`**: Optimized `restore()` function to replace single N+1 insertions loop with chunked bulk insertions.
- **`src/model/db/RecordedDB.ts`**: Optimized `restore()` function to replace single N+1 insertions loop with chunked bulk insertions.
- **`src/model/db/ChannelDB.ts`**: Optimized `insert()` function to replace N+1 `insert().catch(update())` patterns with a bulk chunked `save()` operation.
- **`src/model/db/ProgramDB.ts`**: Optimized `insert()` function to replace N+1 `insert().catch(update())` patterns with a bulk chunked `save()` operation.
