import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateEventThrottle,
  EventThrottledMethod,
  InjectEventThrottle,
  getEventThrottler,
} from "@utils/event-throttler-decorators";
import { EventThrottler } from "@utils/event-throttler";

test("CreateEventThrottle attaches an EventThrottler and methods publish their first argument", async () => {
  const emitted: number[] = [];

  @CreateEventThrottle<number>({
    minMs: 2,
    mode: "last",
    onEmit: (value) => { emitted.push(value); },
  })
  class Publisher {
    @EventThrottledMethod
    public publish(value: number): void {
      throw new Error("The decorated publisher method must not execute");
    }
  }

  const publisher = new Publisher();
  const throttler = getEventThrottler<number>(publisher);

  assert.ok(throttler instanceof EventThrottler);
  publisher.publish(1);
  publisher.publish(2);
  await throttler!.flush();

  assert.deepEqual(emitted, [2]);
  throttler!.dispose();
});

test("InjectEventThrottle shares one event buffer between methods on different classes", async () => {
  const emitted: number[][] = [];
  const shared = new EventThrottler<number>({
    minMs: 2,
    mode: "package",
    onEmit: (values) => { emitted.push(values); },
  });

  @InjectEventThrottle(shared)
  class FirstPublisher {
    @EventThrottledMethod
    public publishFirst(value: number): void {}
  }

  @InjectEventThrottle(shared)
  class SecondPublisher {
    @EventThrottledMethod
    public publishSecond(value: number): void {}
  }

  const first = new FirstPublisher();
  const second = new SecondPublisher();

  assert.equal(getEventThrottler(first), shared);
  assert.equal(getEventThrottler(second), shared);

  first.publishFirst(10);
  second.publishSecond(20);
  await shared.flush();

  assert.deepEqual(emitted, [[10, 20]]);
  shared.dispose();
});

test("EventThrottledMethod rejects methods without an event argument", () => {
  @CreateEventThrottle<number>({
    minMs: 2,
    mode: "last",
    onEmit: () => {},
  })
  class Publisher {
    @EventThrottledMethod
    public publish(): void {}
  }

  assert.throws(() => new Publisher().publish(), /requires an event argument/);
  getEventThrottler(new Publisher())?.dispose();
});
