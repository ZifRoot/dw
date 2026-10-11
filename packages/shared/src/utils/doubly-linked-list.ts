export class DoublyLinkedListNode<T> {
  public readonly value: T;
  public previous: DoublyLinkedListNode<T> | null = null;
  public next: DoublyLinkedListNode<T> | null = null;

  private owner: DoublyLinkedList<T> | null = null;

  public constructor(value: T) {
    this.value = value;
  }

  /** @internal */
  public setOwner(owner: DoublyLinkedList<T> | null): void {
    this.owner = owner;
  }

  /** @internal */
  public belongsTo(list: DoublyLinkedList<T>): boolean {
    return this.owner === list;
  }
}

export class DoublyLinkedList<T> implements Iterable<T> {
  private head: DoublyLinkedListNode<T> | null = null;
  private tail: DoublyLinkedListNode<T> | null = null;
  private count = 0;

  public get size(): number {
    return this.count;
  }

  public get first(): DoublyLinkedListNode<T> | null {
    return this.head;
  }

  public get last(): DoublyLinkedListNode<T> | null {
    return this.tail;
  }

  public append(value: T): DoublyLinkedListNode<T> {
    const node = new DoublyLinkedListNode(value);
    this.insertAtEnd(node);
    return node;
  }

  public prepend(value: T): DoublyLinkedListNode<T> {
    const node = new DoublyLinkedListNode(value);
    this.insertAtStart(node);
    return node;
  }

  public insertBefore(
    reference: DoublyLinkedListNode<T>,
    value: T,
  ): DoublyLinkedListNode<T> {
    this.assertMember(reference);

    const node = new DoublyLinkedListNode(value);
    node.previous = reference.previous;
    node.next = reference;

    if (reference.previous === null) {
      this.head = node;
    } else {
      reference.previous.next = node;
    }

    reference.previous = node;
    node.setOwner(this);
    this.count++;

    return node;
  }

  public insertAfter(
    reference: DoublyLinkedListNode<T>,
    value: T,
  ): DoublyLinkedListNode<T> {
    this.assertMember(reference);

    const node = new DoublyLinkedListNode(value);
    node.previous = reference;
    node.next = reference.next;

    if (reference.next === null) {
      this.tail = node;
    } else {
      reference.next.previous = node;
    }

    reference.next = node;
    node.setOwner(this);
    this.count++;

    return node;
  }

  public remove(node: DoublyLinkedListNode<T>): T | undefined {
    if (!node.belongsTo(this)) return undefined;

    if (node.previous === null) {
      this.head = node.next;
    } else {
      node.previous.next = node.next;
    }

    if (node.next === null) {
      this.tail = node.previous;
    } else {
      node.next.previous = node.previous;
    }

    const value = node.value;

    node.previous = null;
    node.next = null;
    node.setOwner(null);
    this.count--;

    return value;
  }

  public shift(): T | undefined {
    if (this.head === null) return undefined;

    return this.remove(this.head);
  }

  public pop(): T | undefined {
    if (this.tail === null) return undefined;

    return this.remove(this.tail);
  }

  public findNode(
    predicate: (value: T) => boolean,
  ): DoublyLinkedListNode<T> | null {
    for (let node = this.head; node !== null; node = node.next) {
      if (predicate(node.value)) return node;
    }

    return null;
  }

  public clear(): void {
    let node = this.head;

    while (node !== null) {
      const next = node.next;
      node.previous = null;
      node.next = null;
      node.setOwner(null);
      node = next;
    }

    this.head = null;
    this.tail = null;
    this.count = 0;
  }

  public *[Symbol.iterator](): Iterator<T> {
    for (let node = this.head; node !== null; node = node.next) {
      yield node.value;
    }
  }

  private insertAtStart(node: DoublyLinkedListNode<T>): void {
    node.next = this.head;

    if (this.head === null) {
      this.tail = node;
    } else {
      this.head.previous = node;
    }

    this.head = node;
    node.setOwner(this);
    this.count++;
  }

  private insertAtEnd(node: DoublyLinkedListNode<T>): void {
    node.previous = this.tail;

    if (this.tail === null) {
      this.head = node;
    } else {
      this.tail.next = node;
    }

    this.tail = node;
    node.setOwner(this);
    this.count++;
  }

  private assertMember(node: DoublyLinkedListNode<T>): void {
    if (!node.belongsTo(this)) {
      throw new Error("Node does not belong to this list");
    }
  }
}
