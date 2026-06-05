# Execution Management Architecture

The `ExecutionManagementModel` is a core component responsible for queueing and throttling concurrent operations that require exclusive access to shared resources, primarily the SQLite database.

## Motivation

SQLite is the primary database for EPGStation. Because SQLite locks the entire database file during writes, and concurrent connections can easily hit `SQLITE_BUSY` errors when many processes try to write at the same time, EPGStation implements a queueing mechanism. Models such as `ReservationManageModel`, `EncodeManageModel`, and `StreamManageModel` all must request "execution rights" (a lock) before performing heavy database or system operations.

## How it works

When a component needs to perform an operation, it calls `getExecution` on the `ExecutionManagementModel`, providing:
1. `context` - A string describing the origin of the request (e.g. `'ReservationManageModel - ADD_RESERVE'`).
2. `priority` - The priority of the request. Lower numbers are higher priority (e.g. `1` runs before `2`).
3. `timeout` - Optional, defaults to 60 seconds.

### The Queue (`exeQueue`)
The model places the request in an array called `exeQueue`, sorted by priority. It then returns a Promise.

### Obtaining the Lock
If the lock is free, it immediately emits an `UNLOCK_EVENT` with the request's ID. An event listener attached to the Promise will hear this event, clear the timeout timer, remove the listener, and `resolve()` the Promise, granting execution rights to the caller.
If the lock is busy, the request sits in the queue, waiting for its turn.

### Releasing the Lock
When the caller is finished with its operation, it MUST call `unLockExecution(id)`. This function frees the lock and checks the queue. If there are pending items, it shifts the first item off the queue and emits `UNLOCK_EVENT` for the next request's ID, passing the lock along.

### Timeout Handling
If a request sits in the queue longer than the `timeout` period (60 seconds), the `setTimeout` callback fires.
It logs an error with the queue's size, context, and priority.
It then removes the timed-out request from the `exeQueue` array so the queue does not attempt to grant the lock to a dead request.
Finally, it rejects the Promise with a `GetExecutionTimeoutError`. The caller can catch this and handle it (e.g., retrying).

### Dynamic Context Logging
When `getExecution` is called, the `ExecutionManagementModel` captures the caller's context dynamically. It does this by instantiating a dummy `Error` object (`new Error()`) purely to read the V8 `.stack` property without throwing the error. By inspecting the stack trace (specifically the third line), the model determines the class and method name of the caller (e.g. `ReservationManageModel.add`). This caller context is stored in `exeQueueData.context` and aggregated during "max listeners exceeded" warnings to provide detailed queue observability without requiring caller code to manually pass a string context parameter.
