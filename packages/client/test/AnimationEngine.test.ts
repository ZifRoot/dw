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
        performanceTime = aRuns === 1 ? 100 : 150;
      },
    ],
    [
      (deltaTime) => {
        calls.push("B");
        deltas.push(deltaTime);
        performanceTime = 130;
      },
    ],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A"]);

  performanceTime = 116;
  runNextAnimationFrame(116);
  assert.deepEqual(calls, ["A", "B"]);

  performanceTime = 160;
  runNextAnimationFrame(160);

  assert.deepEqual(calls, ["A", "B", "A"]);
  assert.deepEqual(deltas, [0, 0, 60]);
  engine.clear();
});

test("equal completion timestamps preserve FIFO order", () => {
  const calls: string[] = [];
  const engine = createRunningEngine([[() => void calls.push("A")], [() => void calls.push("B")], [() => void calls.push("C")]]);

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
  const dispose = engine.addCallbacks([() => void calls.push("A"), () => void calls.push("B")]);

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
        engine.addCallback(() => void calls.push("D"));
      },
      () => calls.push("B"),
    ],
  ]);

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A", "B"]);

  performanceTime = 96;
  runNextAnimationFrame(96);

  assert.ok(calls.length >= 3);
  assert.equal(calls[2], "D");
  assert.ok(calls.indexOf("D") < calls.indexOf("A", 2));
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

  engine.addCallbacks([self, () => void calls.push("B")]);
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
        () => void calls.push("after"),
      ],
    ]);

    performanceTime = 80;
    runNextAnimationFrame(80);

    assert.deepEqual(calls, ["throw", "after"]);
    assert.equal(errors.length, 1);
    assert.equal((engine as unknown as { isRunning: boolean }).isRunning, true);

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

  assert.equal((engine as unknown as { isCalibrating: string }).isCalibrating, "yes");
  assert.notEqual((engine as unknown as { frameBudgetMs: number | null }).frameBudgetMs, null);

  engine.stop();
  rafQueue.length = 0;

  assert.equal((engine as unknown as { isCalibrating: string }).isCalibrating, "no");
  assert.equal((engine as unknown as { frameBudgetMs: number | null }).frameBudgetMs, null);

  engine.addCallback(() => {});
  assert.equal(rafQueue.length, 1);
  runCalibration();

  assert.equal((engine as unknown as { isCalibrating: string }).isCalibrating, "yes");

  engine.clear();
});

test("a direct generator is a group and ends when it returns done", () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  const generator: AnimationGenerator = (function* () {
    yield () => void calls.push("A1");
    yield () => void calls.push("A2");
  })();

  const engine = new AnimationEngine();
  engine.addGenerator(generator);
  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.deepEqual(calls, ["A1", "A2"]);
  assert.equal((engine as unknown as { isRunning: boolean }).isRunning, false);
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
        performanceTime += 20;
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
      yield () => void calls.push(`A${factoryCalls}`);
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

  engine.addGenerator(
    (function* (): AnimationGenerator {
      yield () => {
        calls.push("B1");
        performanceTime += 4;
      };
    })(),
  );

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
        yield () => void calls.push("A");
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
}

test("async callback blocks the next callback in its group but not independent groups", async () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let resolveAsync!: () => void;
  const asyncCompletion = new Promise<void>((resolve) => {
    resolveAsync = resolve;
  });

  const engine = new AnimationEngine();
  engine.addCallbacks([
    () => {
      calls.push("A");
      return asyncCompletion;
    },
    () => void calls.push("C"),
  ]);
  engine.addCallback(() => {
    calls.push("B");
    performanceTime += 5;
  });

  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);

  assert.equal(calls[0], "A");
  assert.ok(calls.includes("B"));
  assert.equal(calls.includes("C"), false);

  resolveAsync();
  await flushPromises();

  performanceTime = 100;
  runNextAnimationFrame(100);

  assert.ok(calls.includes("C"));
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
  await flushPromises();

  performanceTime = 140;
  runNextAnimationFrame(140);
  assert.deepEqual(calls, ["run1", "run2", "run3"]);

  engine.clear();
});

test("removing a group while its callback is awaiting prevents rescheduling", async () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let resolveAsync!: () => void;
  const asyncCompletion = new Promise<void>((resolve) => {
    resolveAsync = resolve;
  });

  const engine = new AnimationEngine();
  const dispose = engine.addCallback(() => {
    calls.push("A");
    return asyncCompletion;
  });

  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A"]);

  dispose();
  resolveAsync();
  await flushPromises();

  assert.equal(rafQueue.length, 0);
  engine.clear();
});

test("stopping while a callback is awaiting allows a later restart", async () => {
  installAnimationFrameMock();

  const calls: string[] = [];
  let resolveAsync!: () => void;
  const asyncCompletion = new Promise<void>((resolve) => {
    resolveAsync = resolve;
  });

  const engine = new AnimationEngine();
  engine.addCallback(() => {
    calls.push("A");
    return asyncCompletion;
  });

  runCalibration();

  performanceTime = 80;
  runNextAnimationFrame(80);
  assert.deepEqual(calls, ["A"]);

  engine.stop();
  resolveAsync();
  await flushPromises();

  assert.equal(rafQueue.length, 0);

  engine.addCallback(() => void calls.push("B"));
  runCalibration();

  performanceTime = 160;
  runNextAnimationFrame(160);

  assert.ok(calls.includes("B"));
  engine.clear();
});

test("rejected async callback is handled without an unhandled rejection", async () => {
  installAnimationFrameMock();

  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const engine = new AnimationEngine();
    engine.addCallback(() => Promise.reject(new Error("async boom")));

    runCalibration();

    performanceTime = 80;
    runNextAnimationFrame(80);
    await flushPromises();

    assert.equal(errors.length, 1);
    assert.equal((engine as unknown as { isRunning: boolean }).isRunning, false);
  } finally {
    console.error = originalError;
  }
});
