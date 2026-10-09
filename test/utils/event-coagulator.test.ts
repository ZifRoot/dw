import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import { EventCoagulator } from "@utils/event-coagulator";

test("coalesces values and emits the latest value", async () => {
  const emitted: number[] = [];
  const coagulator = new EventCoagulator<number>(10, "latest", (value) => {
    emitted.push(value);
  });

  coagulator.push(1);
  coagulator.push(2);
  coagulator.push(3);
  await coagulator.flush();

  assert.deepEqual(emitted, [3]);
  coagulator.dispose();
});

test("awaits asynchronous processing and does not overlap emissions", async () => {
  const emitted: number[] = [];
  let active = 0;
  let maxActive = 0;
  const coagulator = new EventCoagulator<number>(5, "latest", async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    emitted.push(value);
    await delay(30);
    active -= 1;
  });

  coagulator.push(1);
  await delay(10);
  coagulator.push(2);
  await delay(10);
  coagulator.push(3);
  await delay(35);

  assert.deepEqual(emitted, [1]);
  await coagulator.flush();
  assert.deepEqual(emitted, [1, 3]);
  assert.equal(maxActive, 1);
  coagulator.dispose();
});

test("starts the next delay window after processing completes", async () => {
  const startTimes: number[] = [];
  const completionTimes: number[] = [];
  const delayMs = 25;
  const coagulator = new EventCoagulator<number>(delayMs, "latest", async (value) => {
    startTimes.push(Date.now());
    await delay(40);
    completionTimes.push(Date.now());
    if (value === 1) coagulator.push(2);
  });

  coagulator.push(1);
  await delay(75);

  assert.equal(startTimes.length, 1);
  await delay(delayMs + 25);
  await coagulator.flush();

  assert.equal(startTimes.length, 2);
  assert.ok(startTimes[1] - completionTimes[0] >= delayMs - 3);
  coagulator.dispose();
});

test("averages numeric values", async () => {
  const emitted: number[] = [];
  const coagulator = new EventCoagulator<number>(10, "average", (value) => {
    emitted.push(value);
  });

  coagulator.push(2);
  coagulator.push(4);
  await coagulator.flush();

  assert.deepEqual(emitted, [3]);
  coagulator.dispose();
});

test("retains failed values and reports errors for a later retry", async () => {
  const emitted: number[] = [];
  const errors: unknown[] = [];
  let shouldFail = true;
  const coagulator = new EventCoagulator<number>(
    10,
    "latest",
    (value) => {
      if (shouldFail) throw new Error("write failed");
      emitted.push(value);
    },
    (error) => {
      errors.push(error);
    },
  );

  coagulator.push(1);
  await assert.rejects(coagulator.flush(), /write failed/);
  assert.equal(errors.length, 1);

  shouldFail = false;
  await coagulator.flush();
  assert.deepEqual(emitted, [1]);
  coagulator.dispose();
});

test("flush waits for asynchronous completion", async () => {
  let completed = false;
  const coagulator = new EventCoagulator<number>(100, "latest", async () => {
    await delay(10);
    completed = true;
  });

  coagulator.push(1);
  await coagulator.flush();
  assert.equal(completed, true);
  coagulator.dispose();
});

test("rejects invalid delay", () => {
  assert.throws(() => new EventCoagulator<number>(0, "latest", () => undefined), RangeError);
  assert.throws(
    () => new EventCoagulator<number>(Number.NaN, "latest", () => undefined),
    RangeError,
  );
});
