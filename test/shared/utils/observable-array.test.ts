import assert from "node:assert/strict";
import { test } from "node:test";

import { ObservableArray } from "../../../packages/shared/src/utils/observable-array";

type PrimitiveTestValue = string | number | boolean | bigint | symbol | null | undefined;

interface Events<T> {
  update: Array<{ index: number; value: T }>;
  add: Array<{ index: number; value: T | undefined }>;
  remove: Array<{ index: number; value: T | undefined }>;
}

function subscribe<T extends PrimitiveTestValue>(array: ObservableArray<T[]>): Events<T> {
  const events: Events<T> = {
    update: [],
    add: [],
    remove: [],
  };

  array.onUpdate((items) => events.update.push(...items));
  array.onAdd((items) => events.add.push(...items));
  array.onRemove((items) => events.remove.push(...items));

  return events;
}

test("constructor follows Array semantics", () => {
  const empty = new ObservableArray<number[]>();
  const length = new ObservableArray<number[]>(3);
  const values = new ObservableArray(1, 2, 3);

  assert.deepEqual([...empty], []);
  assert.equal(length.length, 3);
  assert.equal(0 in length, false);
  assert.deepEqual([...values], [1, 2, 3]);

  const events = subscribe(values);
  assert.deepEqual(events, { update: [], add: [], remove: [] });
});

test("index assignment emits update only for an existing changed value", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  array[1] = 20;
  array[1] = 20;

  assert.deepEqual(events.update, [{ index: 1, value: 20 }]);
  assert.deepEqual([...array], [1, 20, 3]);
});

test("index assignment beyond length emits add events for every created position", () => {
  const array = new ObservableArray<number[]>(1);
  const events = subscribe(array);

  array[3] = 40;

  assert.deepEqual(events.add, [
    { index: 1, value: undefined },
    { index: 2, value: undefined },
    { index: 3, value: 40 },
  ]);
  assert.equal(array.length, 4);
  assert.equal(array[3], 40);
});

test("length increase emits add events for every new index", () => {
  const array = new ObservableArray<number[]>(1, 2);
  const events = subscribe(array);

  array.length = 5;

  assert.deepEqual(events.add, [
    { index: 2, value: undefined },
    { index: 3, value: undefined },
    { index: 4, value: undefined },
  ]);
  assert.equal(array.length, 5);
  assert.equal(2 in array, false);
  assert.equal(4 in array, false);
});

test("length decrease emits remove events for removed indexes", () => {
  const array = new ObservableArray<number[]>(1, 2, 3, 4);
  const events = subscribe(array);

  array.length = 2;

  assert.deepEqual(events.remove, [
    { index: 2, value: 3 },
    { index: 3, value: 4 },
  ]);
  assert.deepEqual([...array], [1, 2]);
});

test("push emits added items at their final indexes", () => {
  const array = new ObservableArray<number[]>();
  array[0] = 1;
  const events = subscribe(array);

  assert.equal(array.push(2, 3), 3);

  assert.deepEqual(events.add, [
    { index: 1, value: 2 },
    { index: 2, value: 3 },
  ]);
  assert.deepEqual([...array], [1, 2, 3]);
});

test("pop emits the removed item at its previous index", () => {
  const array = new ObservableArray<number[]>(1, 2);
  const events = subscribe(array);

  assert.equal(array.pop(), 2);

  assert.deepEqual(events.remove, [{ index: 1, value: 2 }]);
  assert.deepEqual(events.update, []);
  assert.deepEqual([...array], [1]);
});

test("shift emits only the removed item", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  assert.equal(array.shift(), 1);

  assert.deepEqual(events.remove, [{ index: 0, value: 1 }]);
  assert.deepEqual(events.update, []);
  assert.deepEqual([...array], [2, 3]);
});

test("unshift emits only added items", () => {
  const array = new ObservableArray<number[]>(2, 3);
  const events = subscribe(array);

  assert.equal(array.unshift(1), 3);

  assert.deepEqual(events.add, [{ index: 0, value: 1 }]);
  assert.deepEqual(events.update, []);
  assert.deepEqual([...array], [1, 2, 3]);
});

test("splice emits removals and additions without index updates", () => {
  const array = new ObservableArray<number[]>(1, 2, 3, 4);
  const events = subscribe(array);

  assert.deepEqual([...array.splice(1, 1, 20, 30)], [2]);

  assert.deepEqual(events.remove, [{ index: 1, value: 2 }]);
  assert.deepEqual(events.add, [
    { index: 1, value: 20 },
    { index: 2, value: 30 },
  ]);
  assert.deepEqual(events.update, []);
  assert.deepEqual([...array], [1, 20, 30, 3, 4]);
});

test("splice without delete count removes the tail", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  assert.deepEqual([...array.splice(1)], [2, 3]);

  assert.deepEqual(events.remove, [
    { index: 1, value: 2 },
    { index: 2, value: 3 },
  ]);
  assert.deepEqual([...array], [1]);
});

test("fill emits updates only for positions whose value changed", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  array.fill(9, 1);

  assert.deepEqual(events.update, [
    { index: 1, value: 9 },
    { index: 2, value: 9 },
  ]);
  assert.deepEqual([...array], [1, 9, 9]);
});

test("reverse emits updates for changed positions", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  array.reverse();

  assert.deepEqual(events.update, [
    { index: 0, value: 3 },
    { index: 2, value: 1 },
  ]);
  assert.deepEqual([...array], [3, 2, 1]);
});

test("sort emits updates for changed positions", () => {
  const array = new ObservableArray<number[]>(3, 1, 2);
  const events = subscribe(array);

  array.sort((a, b) => a - b);

  assert.deepEqual(events.update, [
    { index: 0, value: 1 },
    { index: 1, value: 2 },
    { index: 2, value: 3 },
  ]);
  assert.deepEqual([...array], [1, 2, 3]);
});

test("copyWithin emits updates for changed positions", () => {
  const array = new ObservableArray<number[]>(1, 2, 3, 4);
  const events = subscribe(array);

  array.copyWithin(1, 2);

  assert.deepEqual(events.update, [
    { index: 1, value: 3 },
    { index: 2, value: 4 },
  ]);
  assert.deepEqual([...array], [1, 3, 4, 4]);
});

test("delete emits update to undefined without changing array length", () => {
  const array = new ObservableArray<number[]>(1, 2, 3);
  const events = subscribe(array);

  assert.equal(delete array[1], true);

  assert.deepEqual(events.update, [{ index: 1, value: undefined }]);
  assert.deepEqual(events.remove, []);
  assert.equal(array.length, 3);
  assert.equal(1 in array, false);
  assert.deepEqual([array[0], array[1], array[2]], [1, undefined, 3]);
});

test("empty mutations do not emit events", () => {
  const array = new ObservableArray<number[]>();
  const events: Events<number> = {
    update: [],
    add: [],
    remove: [],
  };

  array.onUpdate((items) => events.update.push(...items));
  array.onAdd((items) => events.add.push(...items));
  array.onRemove((items) => events.remove.push(...items));

  assert.equal(array.pop(), undefined);
  assert.equal(array.shift(), undefined);
  array.push();
  array.unshift();
  array.splice(0, 0);
  array.fill(1, 0, 0);
  array.reverse();
  array.sort();
  array.copyWithin(0, 0, 0);

  assert.deepEqual(events, { update: [], add: [], remove: [] });
});

test("disposing a subscription stops future notifications", () => {
  const array = new ObservableArray<number[]>();
  array[0] = 1;
  const updates: Array<{ index: number; value: number }> = [];

  const dispose = array.onUpdate((items) => updates.push(...items));

  array[0] = 2;
  dispose();
  array[0] = 3;

  assert.deepEqual(updates, [{ index: 0, value: 2 }]);
});
