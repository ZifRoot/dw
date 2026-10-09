import assert from "node:assert/strict";
import { test } from "node:test";

import { EventThrottler } from "@utils/event-throttler";
import { EventCoagulator } from "@utils/event-coagulator";

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

test("EventCoagulator preserves its legacy constructor and inherits EventThrottler", async () => {
  const emitted: number[] = [];
  const coagulator = new EventCoagulator<number>(5, "latest", (value) => { emitted.push(value); });

  assert.ok(coagulator instanceof EventThrottler);
  coagulator.push(1);
  coagulator.push(2);
  await coagulator.flush();

  assert.deepEqual(emitted, [2]);
  coagulator.dispose();
});

test("EventThrottler event callbacks and direct callbacks share the same throttle", async () => {
  const order: string[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 2,
    mode: "all",
    onEmit: (value) => { order.push(`event:${value}`); },
  });

  throttler.push(1);
  const direct = throttler.throttle(() => { order.push("direct"); });
  throttler.push(2);
  await Promise.all([direct, throttler.flush()]);

  assert.deepEqual(order, ["direct", "event:1", "event:2"]);
  throttler.dispose();
});
