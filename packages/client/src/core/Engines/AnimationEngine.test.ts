import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  AnimationCallback,
  AnimationEngine,
  AnimationGenerator,
} from "./AnimationEngine";

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

function createRunningEngine(
  callbackGroups: AnimationCallback[][],
): AnimationEngine {
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
    [() => calls.push("A1"), () => calls.push("A2")],
    [() => calls.push("B1"), () => calls.push("B2")],
  ]);

  performanceTime = 80;
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
        engine.addCallback(() => calls.push("C"));
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
        performanceTime = aRuns === 1 ? 100 : 137;
      },
    ],
    [
      (deltaTime) => {
        calls.push("B");
        deltas.push(deltaTime);
        performanceTime = 117;
      },
    ],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A"]);

  performanceTime = 116;
  runNextAnimationFrame(116);
  assert.deepEqual(calls, ["A", "B", "A"]);

  performanceTime = 160;
  runNextAnimationFrame(160);

  assert.equal(calls[3], "B");
  assert.deepEqual(deltas, [0, 0, 17, 43]);
  engine.clear();
});

test("equal completion timestamps preserve FIFO order", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([
    [() => calls.push("A")],
    [() => calls.push("B")],
    [() => calls.push("C")],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);

  performanceTime = 96;
  runNextAnimationFrame(96);

  assert.deepEqual(calls.slice(3, 6), ["A", "B", "C"]);
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

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, []);
  engine.clear();
});

test("a group added during a step waits for the next step", () => {
  const calls: string[] = [];
  let engine: AnimationEngine;

  engine = createRunningEngine([
    [
      () => {
        calls.push("A");
        engine.addCallback(() => calls.push("D"));
      },
      () => calls.push("B"),
    ],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A", "B"]);

  performanceTime = 96;
  runNextAnimationFrame(96);
  assert.deepEqual(calls, ["A", "B", "D", "A"]);
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

  performanceTime = 80;
  runNextAnimationFrame(80);
  performanceTime = 96;
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

    performanceTime = 80;
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

test("a direct generator is a group and ends when it returns done", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const generator: AnimationGenerator = (function* () {
    yield () => calls.push("A1");
    yield () => calls.push("A2");
  })();

  const engine = new AnimationEngine();
  engine.addGenerator(generator);
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "A2"]);
  assert.equal(
    (engine as unknown as { isRunning: boolean }).isRunning,
    false,
  );
});

test("generator callbacks participate in common group scheduling", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const generatorA: AnimationGenerator = (function* () {
    yield () => {
      calls.push("A1");
      performanceTime += 4;
    };
    yield () => {
      calls.push("A2");
      performanceTime += 4;
    };
  })();
  const generatorB: AnimationGenerator = (function* () {
    yield () => {
      calls.push("B1");
      performanceTime += 4;
    };
  })();

  const engine = new AnimationEngine();
  engine.addGenerator(generatorA);
  engine.addGenerator(generatorB);
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2"]);
  engine.clear();
});

test("generator can continue in the next frame without recreating it", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let factoryCalls = 0;

  const engine = new AnimationEngine();
  engine.addGeneratorFactory(() => {
    factoryCalls++;

    return (function* (): AnimationGenerator {
      yield () => {
        calls.push("A1");
        performanceTime += 10;
      };
      yield () => {
        calls.push("A2");
        performanceTime += 10;
      };
    })();
  });
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.equal(factoryCalls, 1);
  assert.deepEqual(calls, ["A1"]);

  performanceTime = 100;
  runNextAnimationFrame(100);

  assert.equal(factoryCalls, 1);
  assert.deepEqual(calls, ["A1", "A2"]);

  engine.clear();
});

test("generator factory creates a new generator on the next frame after exhaustion", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let factoryCalls = 0;

  const engine = new AnimationEngine();
  engine.addGeneratorFactory(() => {
    factoryCalls++;

    return (function* (): AnimationGenerator {
      yield () => calls.push(`A${factoryCalls}`);
    })();
  });
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.equal(factoryCalls, 1);
  assert.deepEqual(calls, ["A1"]);

  performanceTime = 100;
  runNextAnimationFrame(100);

  assert.equal(factoryCalls, 2);
  assert.deepEqual(calls, ["A1", "A2"]);

  engine.clear();
});

test("generator factory callbacks are interleaved with other groups", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const engine = new AnimationEngine();

  engine.addGeneratorFactory(() => {
    return (function* (): AnimationGenerator {
      yield () => {
        calls.push("A1");
        performanceTime += 4;
      };
      yield () => {
        calls.push("A2");
        performanceTime += 4;
      };
    })();
  });

  engine.addGenerator((function* (): AnimationGenerator {
    yield () => {
      calls.push("B1");
      performanceTime += 4;
    };
  })());

  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "B1", "A2"]);
  engine.clear();
});


test("generator factory failure is deferred to the next frame", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const errors: unknown[][] = [];
  const originalError = console.error;
  let factoryCalls = 0;

  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const engine = new AnimationEngine();
    engine.addGeneratorFactory(() => {
      factoryCalls++;

      if (factoryCalls === 1) {
        throw new Error("factory failed");
      }

      return (function* (): AnimationGenerator {
        yield () => calls.push("A");
      })();
    });

    runCalibration();

    performanceTime = 80;
    runNextAnimationFrame(80);

    assert.equal(factoryCalls, 1);
    assert.deepEqual(calls, []);
    assert.equal(errors.length, 1);

    performanceTime = 100;
    runNextAnimationFrame(100);

    assert.equal(factoryCalls, 2);
    assert.deepEqual(calls, ["A"]);

    engine.clear();
  } finally {
    console.error = originalError;
  }
});
