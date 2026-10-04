import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AnimationCallback, AnimationEngine, AnimationGenerator } from "../src/core/Engines/AnimationEngine";

type RafCallback = (timestamp: number) => void;

const rafQueue: RafCallback[] = [];
let performanceTime = 0;

function installAnimationFrameMock(): void {
  rafQueue.length = 0;
  performanceTime = 0;

  globalThis.requestAnimationFrame = (callback: RafCallback): number => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = (): void => {};

  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => performanceTime },
  });
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
  performanceTime = 64;
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

test("groups are the scheduling unit and callback order is preserved", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([
    [() => void calls.push("A1"), () => void calls.push("A2")],
    [() => void calls.push("B1"), () => void calls.push("B2")],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2", "B2"]);
  engine.clear();
});

test("a group is not atomic", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([[() => void calls.push("A1"), () => void calls.push("A2")], [() => void calls.push("B1")]]);

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2"]);
  engine.clear();
});

test("never-started groups have priority in registration order", () => {
  const calls: string[] = [];
  let engine: AnimationEngine;

  engine = createRunningEngine([
    [
      () => {
        calls.push("A");
        engine.addCallback(() => void calls.push("C"));
      },
    ],
    [() => calls.push("B")],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls.slice(0, 2), ["A", "B"]);

  performanceTime = 96;
  runNextAnimationFrame(96);
  assert.deepEqual(calls.slice(2, 4), ["C", "A"]);
  engine.clear();
});

test("lastCompletedAt determines priority after a long callback", () => {
  const calls: string[] = [];
  const deltas: number[] = [];
  let aRuns = 0;

  const engine = createRunningEngine([
    [
      (deltaTime) => {
        calls.push("A");
        deltas.push(deltaTime);
        aRuns++;
        performanceTime += aRuns === 1 ? 10 : 1;
      },
    ],
    [
      (deltaTime) => {
        calls.push("B");
        deltas.push(deltaTime);
        performanceTime += 2;
      },
    ],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A", "B"]);

  performanceTime = 100;
  runNextAnimationFrame(100);

  assert.deepEqual(calls, ["A", "B", "A"]);
  assert.deepEqual(deltas, [0, 10, 10]);
  engine.clear();
});

test("the same callback can complete synchronously and asynchronously on different runs", async () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let run = 0;
  let resolveAsync!: () => void;
  const asyncCompletion = new Promise<void>((resolve) => {
    resolveAsync = resolve;
  });

  const callback: AnimationCallback = () => {
    run++;
    calls.push(`run${run}`);

    if (run === 2) {
      return asyncCompletion;
    }

    performanceTime += 10;
  };

  const engine = new AnimationEngine();
  engine.addCallback(callback);
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["run1"]);

  performanceTime = 100;
  runNextAnimationFrame(100);
  assert.deepEqual(calls, ["run1", "run2"]);

  assert.equal(rafQueue.length, 0);

  resolveAsync();
  await asyncCompletion;

  performanceTime = 140;
  runNextAnimationFrame(140);
  assert.deepEqual(calls, ["run1", "run2", "run3"]);

  engine.clear();
});