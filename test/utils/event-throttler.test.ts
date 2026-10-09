import assert from "node:assert/strict";
import { test } from "node:test";

import { EventThrottler } from "@utils/event-throttler";

test("EventThrottler last mode emits only the last value in a window", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 5,
    mode: "last",
    onEmit: (value) => { emitted.push(value); },
  });

  throttler.push(1);
  throttler.push(2);
  throttler.push(3);
  await throttler.flush();

  assert.deepEqual(emitted, [3]);
  throttler.dispose();
});

test("EventThrottler average mode emits the numeric average", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 5,
    mode: "average",
    onEmit: (value) => { emitted.push(value); },
  });

  throttler.push(2);
  throttler.push(4);
  await throttler.flush();

  assert.deepEqual(emitted, [3]);
  throttler.dispose();
});

test("EventThrottler all mode emits each event in order", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 5,
    minMs: 1,
    mode: "all",
    onEmit: async (value) => { emitted.push(value); },
  });

  throttler.push(1);
  throttler.push(2);
  throttler.push(3);
  await throttler.flush();

  assert.deepEqual(emitted, [1, 2, 3]);
  throttler.dispose();
});

test("EventThrottler package mode emits one array per window", async () => {
  const emitted: number[][] = [];
  const throttler = new EventThrottler<number>({
    minMs: 5,
    mode: "package",
    onEmit: (values) => { emitted.push(values); },
  });

  throttler.push(1);
  throttler.push(2);
  throttler.push(3);
  await throttler.flush();

  assert.deepEqual(emitted, [[1, 2, 3]]);
  throttler.dispose();
});

test("EventThrottler throttle serializes async callbacks and returns their values", async () => {
  const throttler = new EventThrottler<void>({ minMs: 1, mode: "all", onEmit: () => undefined });
  const order: number[] = [];
  let active = 0;
  let maxActive = 0;

  const run = (value: number) => throttler.throttle(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    order.push(value);
    active -= 1;
    return value * 10;
  });

  const results = await Promise.all([run(1), run(2), run(3)]);

  assert.deepEqual(results, [10, 20, 30]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(maxActive, 1);
});
