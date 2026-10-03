import assert from "node:assert/strict";
import { test } from "node:test";

import { ObservableArray } from "@utils/observable-array";
import { ObservableObject, event } from "@utils/observable-object";

test("constructor accepts a plain object and creates an ObservableObject", () => {
  const source = {
    temperature: 20,
  };

  const observable = new ObservableObject(source) as any;

  assert.equal(source instanceof Object, true);
  assert.equal(source instanceof ObservableObject, false);
  assert.equal(observable instanceof Object, true);
  assert.equal(observable instanceof ObservableObject, true);
  assert.equal(observable.temperature, 20);
});

test("constructor rejects an ObservableObject as input", () => {
  const observable = new ObservableObject({
    temperature: 20,
  }) as any;

  assert.throws(
    () => new ObservableObject(observable),
    {
      name: "TypeError",
      message: "ObservableObject cannot be wrapped in another ObservableObject.",
    },
  );
});

test("constructor rejects non-plain objects", () => {
  assert.throws(() => new ObservableObject(new Date() as never), TypeError);
  assert.throws(() => new ObservableObject([] as never), TypeError);
});

test("property assignment emits only when the value changes", () => {
  const observable = new ObservableObject({
    temperature: 20,
  });
  const values: number[] = [];

  observable.onTemperature((value) => values.push(value));

  observable.temperature = 20;
  observable.temperature = 21;
  observable.temperature = 21;
  observable.temperature = 22;

  assert.deepEqual(values, [21, 22]);
  assert.equal(observable.temperature, 22);
});

test("property assignment replaces the stored value", () => {
  const observable = new ObservableObject({
    value: 1,
  });

  observable.value = 2;

  assert.equal(observable.value, 2);
});

test("nested plain objects are converted recursively", () => {
  const observable = new ObservableObject({
    config: {
      temperature: 20,
      limits: {
        minimum: 0,
        maximum: 100,
      },
    },
  });

  assert.equal(observable.config instanceof ObservableObject, true);
  assert.equal(observable.config.limits instanceof ObservableObject, true);
  assert.equal(observable.config.temperature, 20);
  assert.equal(observable.config.limits.maximum, 100);
});

test("arrays are converted to ObservableArray", () => {
  const observable = new ObservableObject({
    values: [1, 2, 3],
  });

  assert.equal(observable.values instanceof ObservableArray, true);
  assert.deepEqual([...observable.values], [1, 2, 3]);
});

test("special objects remain unchanged", () => {
  const date = new Date(0);
  const map = new Map([["key", "value"]]);

  const observable = new ObservableObject({
    date,
    map,
  });

  assert.equal(observable.date, date);
  assert.equal(observable.map, map);
});

test("event members dispatch without storing application logic", () => {
  const observable = new ObservableObject({
    reset: event(),
  });
  const calls: number[] = [];

  observable.onReset(() => calls.push(1));
  observable.reset();

  assert.deepEqual(calls, [1]);
});

test("event members support payloads", () => {
  const observable = new ObservableObject({
    selected: event<[number]>(),
  });
  const values: number[] = [];

  observable.onSelected((value) => values.push(value));
  observable.selected(42);

  assert.deepEqual(values, [42]);
});

test("event members cannot be assigned", () => {
  const observable = new ObservableObject({
    reset: event(),
  });

  assert.throws(() => {
    observable.reset = (() => undefined) as never;
  }, TypeError);
});

test("managed properties and events cannot be deleted", () => {
  const observable = new ObservableObject({
    temperature: 20,
    reset: event(),
  });

  assert.throws(() => {
    delete observable.temperature;
  }, TypeError);

  assert.throws(() => {
    delete observable.reset;
  }, TypeError);
});

test("subscriptions can be disposed", () => {
  const observable = new ObservableObject({
    temperature: 20,
  });
  const values: number[] = [];

  const dispose = observable.onTemperature((value) => values.push(value));

  observable.temperature = 21;
  dispose();
  observable.temperature = 22;

  assert.deepEqual(values, [21]);
});
