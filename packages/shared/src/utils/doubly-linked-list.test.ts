import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DoublyLinkedList,
  DoublyLinkedListNode,
} from "./doubly-linked-list";

test("supports insertion and iteration in both directions", () => {
  const list = new DoublyLinkedList<number>();

  const second = list.append(2);
  list.prepend(1);
  list.append(4);
  list.insertAfter(second, 3);

  assert.deepEqual([...list], [1, 2, 3, 4]);
  assert.equal(list.size, 4);
  assert.equal(list.first?.value, 1);
  assert.equal(list.last?.value, 4);
  assert.equal(list.first?.next?.value, 2);
  assert.equal(list.last?.previous?.value, 3);
});

test("removes a node in constant-time using its node reference", () => {
  const list = new DoublyLinkedList<number>();
  const first = list.append(1);
  const middle = list.append(2);
  const last = list.append(3);

  assert.equal(list.remove(middle), 2);
  assert.equal(first.next, last);
  assert.equal(last.previous, first);
  assert.deepEqual([...list], [1, 3]);
  assert.equal(list.remove(middle), undefined);
});

test("supports queue and stack operations", () => {
  const list = new DoublyLinkedList<string>();

  list.append("b");
  list.prepend("a");
  list.append("c");

  assert.equal(list.shift(), "a");
  assert.equal(list.pop(), "c");
  assert.equal(list.shift(), "b");
  assert.equal(list.shift(), undefined);
  assert.equal(list.size, 0);
});

test("rejects insertion relative to a node from another list", () => {
  const firstList = new DoublyLinkedList<number>();
  const secondList = new DoublyLinkedList<number>();
  const node = firstList.append(1);

  assert.throws(() => secondList.insertBefore(node, 0));
  assert.throws(() => secondList.insertAfter(node, 2));
});

test("clear detaches all nodes", () => {
  const list = new DoublyLinkedList<number>();
  const first = list.append(1);
  const second = list.append(2);

  list.clear();

  assert.equal(list.size, 0);
  assert.equal(list.first, null);
  assert.equal(list.last, null);
  assert.equal(first.next, null);
  assert.equal(first.previous, null);
  assert.equal(second.next, null);
  assert.equal(second.previous, null);
});

test("findNode returns the first matching node", () => {
  const list = new DoublyLinkedList<number>();
  const expected = list.append(2);
  list.append(4);

  assert.equal(list.findNode((value) => value % 2 === 0), expected);
  assert.equal(
    list.findNode((value) => value > 10),
    null,
  );
});

test("node references remain typed independently of the stored value", () => {
  const list = new DoublyLinkedList<string>();
  const node: DoublyLinkedListNode<string> = list.append("value");

  assert.equal(node.value, "value");
});
