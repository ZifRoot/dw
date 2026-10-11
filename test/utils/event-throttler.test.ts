import assert from "node:assert/strict";
import test from "node:test";
import { EventCoagulator } from "@utils/event-coagulator";
import { EventThrottler } from "@utils/event-throttler";

test("EventThrottler last mode emits the latest value in a collection window", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 5,
    mode: "last",
    onEmit: (value) => { emitted.push(value); },
  });

  throttler.push(1);
  throttler.push(2);
  await throttler.flush();

  assert.deepEqual(emitted, [2]);
  throttler.dispose();
});

test("EventThrottler all mode emits each value", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 2,
    mode: "all",
    onEmit: (value) => { emitted.push(value); },
  });

  throttler.push(1);
  throttler.push(2);
  await throttler.flush();

  assert.deepEqual(emitted, [1, 2]);
  throttler.dispose();
});

test("EventThrottler average mode emits the arithmetic mean", async () => {
  const emitted: number[] = [];
  const throttler = new EventThrottler<number>({
    minMs: 2,
    mode: "average",
    onEmit: (value) => { emitted.push(value); },
  });

  throttler.push(2);
  throttler.push(4);
  await throttler.flush();

  assert.deepEqual(emitted, [3]);
  throttler.dispose();
});

test("EventThrottler package mode emits the collected array", async () => {
  const emitted: number[][] = [];
  const throttler = new EventThrottler<number>({
    minMs: 2,
    mode: "package",
    onEmit: (values) => { emitted.push(values); },
  });

  throttler.push(1);
  throttler.push(2);
  await throttler.flush();

  assert.deepEqual(emitted, [[1, 2]]);
  throttler.dispose();
});

test("EventCoagulator keeps its legacy constructor and inherits EventThrottler", async () => {
  const emitted: number[] = [];
  const coagulator = new EventCoagulator<number>(5, "latest", (value) => { emitted.push(value); });

  assert.ok(coagulator instanceof EventThrottler);
  coagulator.push(1);
  coagulator.push(2);
  await coagulator.flush();

  assert.deepEqual(emitted, [2]);
  coagulator.dispose();
});

test("direct callbacks and event callbacks share the inherited throttle queue", async () => {
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
