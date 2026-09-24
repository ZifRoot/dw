import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AnimationCallback, AnimationEngine } from "./AnimationEngine";

type RafCallback = (timestamp: number) => void;

const rafQueue: RafCallback[] = [];

function installAnimationFrameMock(): void {
  rafQueue.length = 0;
  globalThis.requestAnimationFrame = (callback: RafCallback): number => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = (): void => {};
}

function runNextAnimationFrame(timestamp: number): void {
  const callback = rafQueue.shift();
  assert.ok(callback, "Expected a scheduled animation frame");
  callback(timestamp);
}

function runCalibration(): void {
  runNextAnimationFrame(0);
  runNextAnimationFrame(16);
  runNextAnimationFrame(32);
  runNextAnimationFrame(48);
  runNextAnimationFrame(64);
}

function createRunningEngine(callbackGroups: AnimationCallback[][]): AnimationEngine {
  installAnimationFrameMock();

  const engine = new AnimationEngine();

  for (const callbacks of callbackGroups) {
    engine.addCallbacks(callbacks);
  }

  runCalibration();
  return engine;
}

test("addCallbacks keeps callback order inside a group and interleaves groups", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([
    [() => calls.push("A1"), () => calls.push("A2")],
    [() => calls.push("B1"), () => calls.push("B2")],
  ]);

  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2", "B2"]);
  engine.clear();
});

test("a group is not atomic", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([
    [() => calls.push("A1"), () => calls.push("A2")],
    [() => calls.push("B1")],
  ]);

  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2"]);
  engine.clear();
});

test("the disposer removes the whole group", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const engine = new AnimationEngine();
  const dispose = engine.addCallbacks([
    () => calls.push("A"),
    () => calls.push("B"),
  ]);

  runCalibration();
  dispose();

  runNextAnimationFrame(80);
  assert.deepEqual(calls, []);
  engine.clear();
});

test("a callback added during a step waits for the next step", () => {
  const calls: string[] = [];
  let engine: AnimationEngine;

  engine = createRunningEngine([
    [
      () => {
        calls.push("A");
        engine.addCallbacks([() => calls.push("D")]);
      },
      () => calls.push("B"),
    ],
  ]);

  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A", "B"]);

  runNextAnimationFrame(96);
  assert.deepEqual(calls, ["A", "B", "A", "D", "B"]);
  engine.clear();
});

test("self-removal prevents the callback from running again", () => {
  const calls: string[] = [];
  const engine = new AnimationEngine();
  let self: AnimationCallback;

  installAnimationFrameMock();

  self = () => {
    calls.push("A");
    engine.removeCallback(self);
  };

  engine.addCallbacks([self, () => calls.push("B")]);
  runCalibration();

  runNextAnimationFrame(80);
  runNextAnimationFrame(96);

  assert.deepEqual(calls, ["A", "B", "B"]);
  engine.clear();
});

test("callback exceptions do not stop the scheduler", () => {
  const calls: string[] = [];
  const errors: unknown[][] = [];
  const originalError = console.error;

  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const engine = createRunningEngine([
      [
        () => {
          calls.push("throw");
          throw new Error("boom");
        },
        () => calls.push("after"),
      ],
    ]);

    runNextAnimationFrame(80);

    assert.deepEqual(calls, ["throw", "after"]);
    assert.equal(errors.length, 1);
    assert.equal(
      (engine as unknown as { isRunning: boolean }).isRunning,
      true,
    );

    engine.clear();
  } finally {
    console.error = originalError;
  }
});

test("stop resets calibration and the next start recalibrates", () => {
  installAnimationFrameMock();

  const engine = new AnimationEngine();
  engine.addCallback(() => {});
  runCalibration();

  assert.equal(
    (engine as unknown as { isCalibrating: string }).isCalibrating,
    "yes",
  );
  assert.notEqual(
    (engine as unknown as { frameBudgetMs: number | null }).frameBudgetMs,
    null,
  );

  engine.stop();
  rafQueue.length = 0;

  assert.equal(
    (engine as unknown as { isCalibrating: string }).isCalibrating,
    "no",
  );
  assert.equal(
    (engine as unknown as { frameBudgetMs: number | null }).frameBudgetMs,
    null,
  );

  engine.addCallback(() => {});
  assert.equal(rafQueue.length, 1);
  runCalibration();

  assert.equal(
    (engine as unknown as { isCalibrating: string }).isCalibrating,
    "yes",
  );

  engine.clear();
});
