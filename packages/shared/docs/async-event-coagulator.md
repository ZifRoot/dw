# EventCoagulator

`EventCoagulator<T>` combines frequent primitive values into asynchronous, non-overlapping callback executions.

## Timing and aggregation

- `push(value)` adds a value to the current collection window. The first push starts the delay; further pushes do not reset that timer.
- At the end of the delay, `latest` emits the final value in the window, while `average` computes the mean of numeric values.
- `onEmit` may return a promise. The next delay window starts only after that promise settles successfully, so callbacks from one instance never overlap.
- Values pushed while a callback is running are collected for the next emission.
- Consecutive equal results are suppressed using strict equality. The utility intentionally does not deep-compare objects.

## Errors and lifecycle

- If `onEmit` rejects or throws, its values are restored to the pending collection and `onError`, if provided, is notified.
- A failed batch is not retried in a tight loop. A later `push` schedules another attempt, or `flush()` can retry immediately.
- `flush()` returns a promise and waits for processing. It rejects if the processing attempt fails; pending values are retained for a later retry.
- `dispose()` cancels the timer and discards values not yet being processed. It does not cancel a callback already in progress.

## Example

```ts
const coagulator = new EventCoagulator(1000, "latest", async (revision) => {
  await persistCurrentState(revision);
}, (error) => {
  console.error("Persistence failed", error);
});

coagulator.push(1);
// On shutdown:
await coagulator.flush();
coagulator.dispose();
```

The delay is a minimum quiet period after a successful callback completes. A callback may take longer than the delay; no second callback starts until the first finishes and the next delay elapses.
