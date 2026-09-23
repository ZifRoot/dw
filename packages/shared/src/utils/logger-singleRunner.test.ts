import assert from "node:assert/strict";
import { test } from "node:test";

import { createLoggedMethodRunner, _safe } from "./logger";
import { ExecutionGuard, createSingleRunner } from "./single-runner";

async function captureErrors<T>(action: () => Promise<T>): Promise<{ result: T; errors: unknown[] }> {
  const errors: unknown[] = [];
  const original = console.error;

  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const result = await action();
    return { result, errors };
  } finally {
    console.error = original;
  }
}

test("Log semantics: error is logged and propagated", async () => {
  const expected = new Error("log failure");

  const method = createLoggedMethodRunner(
    async () => {
      throw expected;
    },
    "test.Log",
  );

  const { errors } = await captureErrors(async () => {
    await assert.rejects(method, (error) => error === expected);
    return undefined;
  });

  assert.equal(errors.length, 1);
});

test("LogSafe semantics: error is logged and converted to null", async () => {
  const expected = new Error("safe failure");

  const method = createLoggedMethodRunner(
    async () => {
      throw expected;
    },
    "test.LogSafe",
    false,
    true,
  );

  const { result, errors } = await captureErrors(() => method());

  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.equal((errors[0] as unknown[])[1], expected);
});

test("Safe semantics: error is logged and converted to null", async () => {
  const expected = new Error("safe failure");

  const method = _safe(async () => {
    throw expected;
  });

  const { result, errors } = await captureErrors(() => method());

  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], [expected]);
});

test("Safe operation can be used per item in a batch", async () => {
  const expected = new Error("one item failed");

  const processItem = _safe(async (item: number) => {
    if (item === 2) {
      throw expected;
    }

    return item * 10;
  });

  const { result, errors } = await captureErrors(() =>
    Promise.all([processItem(1), processItem(2), processItem(3)]),
  );

  assert.deepEqual(result, [10, null, 30]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], [expected]);
});

test("SingleRunner retry mode clears a failed run and starts the next run", async () => {
  let calls = 0;
  const expected = new Error("transient failure");

  const run = createSingleRunner(async () => {
    calls += 1;

    if (calls === 1) {
      throw expected;
    }

    return "ok";
  });

  await assert.rejects(run, (error) => error === expected);
  assert.equal(await run(), "ok");
  assert.equal(calls, 2);
});

test("ExecutionGuard cleanup does not create an unhandled rejection", async () => {
  const guard = new ExecutionGuard();
  const expected = new Error("runner failure");
  const unhandled: unknown[] = [];

  const onUnhandledRejection = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const run = guard.tryStart(
      async () => {
        throw expected;
      },
      "retry",
    );

    await assert.rejects(run, (error) => error === expected);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }
});

test("ExecutionGuard supports strict failure followed by retry on the same guard", async () => {
  const guard = new ExecutionGuard();
  const expected = new Error("sticky failure");
  let calls = 0;

  const failing = () => {
    calls += 1;
    return Promise.reject(expected);
  };

  const succeeding = () => {
    calls += 1;
    return Promise.resolve("ok");
  };

  await assert.rejects(guard.tryStart(failing, "strict"), (error) => error === expected);
  await assert.rejects(guard.tryStart(succeeding, "strict"), (error) => error === expected);
  assert.equal(calls, 1);

  assert.equal(await guard.tryStart(succeeding, "retry"), "ok");
  assert.equal(calls, 2);
});
