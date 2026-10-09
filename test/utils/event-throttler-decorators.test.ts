import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateEventThrottle,
  EventThrottledMethod,
  InjectEventThrottle,
  getEventThrottler,
} from "@utils/event-throttler-decorators";
import { EventThrottler } from "@utils/event-throttler";

function applyMethodDecorator(
  prototype: object,
  methodName: string,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
  assert.ok(descriptor);
  EventThrottledMethod(prototype, methodName, descriptor);
  Object.defineProperty(prototype, methodName, descriptor);
}

test("CreateEventThrottle attaches an EventThrottler and methods publish their first argument", async () => {
  const emitted: number[] = [];

  class Publisher {
    public publish(_value: number): void {
      throw new Error("The decorated publisher method must not execute");
    }
  }

  applyMethodDecorator(Publisher.prototype, "publish");
  const DecoratedPublisher = CreateEventThrottle<number>({
    minMs: 2,
    mode: "last",
    onEmit: (value) => { emitted.push(value); },
  })(Publisher);

  const publisher = new DecoratedPublisher();
  const throttler = getEventThrottler<number>(publisher);

  assert.ok(throttler instanceof EventThrottler);
  publisher.publish(1);
  publisher.publish(2);
  await throttler.flush();

  assert.deepEqual(emitted, [2]);
  throttler.dispose();
});

test("InjectEventThrottle shares one event buffer between methods on different classes", async () => {
  const emitted: number[][] = [];
  const shared = new EventThrottler<number>({
    minMs: 2,
    mode: "package",
    onEmit: (values) => { emitted.push(values); },
  });

  class FirstPublisher {
    public publishFirst(_value: number): void {}
  }
  class SecondPublisher {
    public publishSecond(_value: number): void {}
  }

  applyMethodDecorator(FirstPublisher.prototype, "publishFirst");
  applyMethodDecorator(SecondPublisher.prototype, "publishSecond");
  const DecoratedFirstPublisher = InjectEventThrottle(shared)(FirstPublisher);
  const DecoratedSecondPublisher = InjectEventThrottle(shared)(SecondPublisher);

  const first = new DecoratedFirstPublisher();
  const second = new DecoratedSecondPublisher();

  assert.equal(getEventThrottler(first), shared);
  assert.equal(getEventThrottler(second), shared);

  first.publishFirst(10);
  second.publishSecond(20);
  await shared.flush();

  assert.deepEqual(emitted, [[10, 20]]);
  shared.dispose();
});

test("EventThrottledMethod rejects methods without an event argument", () => {
  class Publisher {
    public publish(): void {}
  }

  applyMethodDecorator(Publisher.prototype, "publish");
  const DecoratedPublisher = CreateEventThrottle<number>({
    minMs: 2,
    mode: "last",
    onEmit: () => {},
  })(Publisher);
  const publisher = new DecoratedPublisher();

  assert.throws(() => publisher.publish(), /requires an event argument/);
  getEventThrottler(publisher)?.dispose();
});
