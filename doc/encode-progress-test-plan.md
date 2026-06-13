# EPGStation Encode Progress Test Plan

## Objective
To isolate and reproduce the silent failure of JSON parsing in `EncoderModel.ts` when progress data from a custom encoding script is chunked unpredictably by standard output streams.

## The Hypothesis
When an encoding script emits `{"type":"progress", "percent": 0.5, "log": "..."}\n`, the node `ChildProcess.stdout` might emit this data across multiple `data` events (chunks).
Currently, `EncoderModel.ts` simply does:
```typescript
const logs = String(data).split('\n');
for (let j = 0; j < logs.length; j++) {
    const log = JSON.parse(String(logs[j])); // <--- FAILS if chunk is incomplete
}
```
Because there is no stream buffer accumulating partial strings until a `\n` is reached, split strings that cross chunk boundaries will throw an error in `JSON.parse()`, causing the progress bar to drop updates or stay at 0%.

## Test Implementation
We will create a lightweight node script (`test-encode-progress.js`) to prove this failure and test the fix.

1. **Mock Encoder Script:**
   We will write an inline mock script that outputs JSON progress strings, but deliberately splits the strings across multiple `process.stdout.write()` calls to simulate extreme stream chunking.

2. **Test Runner:**
   The runner will spawn the mock script as a child process, similar to how `processManager.create` works. It will attach the exact logic from `EncoderModel.ts`'s `updateEncodingProgressInfo` function.

3. **Assertion:**
   The test will assert how many successful `JSON.parse()` calls occur.
   - **Pre-fix:** We expect 0 or partial success due to chunking.
   - **Post-fix:** We expect 100% success by implementing a string buffer.

## Expected Fix
Modify `EncoderModel.ts` to implement a persistent string buffer instance variable (`private stdoutBuffer: string = '';`).
When `data` arrives:
1. Append `data.toString()` to `stdoutBuffer`.
2. Find the last index of `\n`.
3. If `\n` exists, slice the buffer up to that index, split by `\n`, parse the JSON, and retain the remaining partial string in the buffer for the next chunk.
