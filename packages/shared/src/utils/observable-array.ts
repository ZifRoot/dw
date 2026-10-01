type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type Property<T extends Primitive[]> = keyof T;

export interface ObservableArrayItem<T> {
  index: number;
  value: T;
}

export interface ObservableArrayEvents<T extends Primitive[]> {
  update: (items: ObservableArrayItem<T[number]>[]) => void;
  add: (items: ObservableArrayItem<T[number] | undefined>[]) => void;
  remove: (items: ObservableArrayItem<T[number] | undefined>[]) => void;
}

/**
 * Минимальный типизированный emitter.
 *
 * ObservableArray не хранит подписчиков самостоятельно.
 * Подписка и публикация событий выполняются через EventEmitter.
 */
class EventEmitter<
  TEventMap extends {
    [K in keyof TEventMap]: (...args: any[]) => void;
  },
> {
  private readonly listeners = new Map<keyof TEventMap, Set<TEventMap[keyof TEventMap]>>();

  public addListener<K extends keyof TEventMap>(eventName: K, callback: TEventMap[K]): void {
    let listeners = this.listeners.get(eventName);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(eventName, listeners);
    }

    listeners.add(callback);
  }

  public removeListener<K extends keyof TEventMap>(eventName: K, callback: TEventMap[K]): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    listeners.delete(callback);

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  public emit<K extends keyof TEventMap>(eventName: K, ...args: Parameters<TEventMap[K]>): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(...args);
    }
  }
}

const observableArrayEvents = new WeakMap<object, EventEmitter<any>>();

export class ObservableArray<T extends Primitive[]> extends Array<T[number]> {
  public constructor(...args: [number] | T[number][]) {
    super(...args);

    const target = this;
    const events = new EventEmitter<ObservableArrayEvents<T>>();
    observableArrayEvents.set(target, events);

    const proxy = new Proxy(target, {
      set: (currentTarget, property, value): boolean => {
        if (property === "length") {
          const oldLength = currentTarget.length;
          const newLength = value as number;

          if (oldLength === newLength) {
            return true;
          }

          if (newLength < oldLength) {
            const removed: ObservableArrayItem<T[number] | undefined>[] = [];

            for (let index = newLength; index < oldLength; index++) {
              removed.push({
                index,
                value: currentTarget[index],
              });
            }

            currentTarget.length = newLength;
            getEvents(currentTarget).emit("remove", removed);

            return true;
          }

          currentTarget.length = newLength;

          const added: ObservableArrayItem<T[number] | undefined>[] = [];

          for (let index = oldLength; index < newLength; index++) {
            added.push({
              index,
              value: undefined,
            });
          }

          getEvents(currentTarget).emit("add", added);

          return true;
        }

        const index = getArrayIndex(property);

        if (index === undefined) {
          return Reflect.set(currentTarget, property, value);
        }

        const oldLength = currentTarget.length;
        const existed = index in currentTarget;
        const oldValue = currentTarget[index];

        if (existed && oldValue === value) {
          return true;
        }

        currentTarget[index] = value as T[number];

        if (!existed) {
          const added: ObservableArrayItem<T[number] | undefined>[] = [];

          for (let addedIndex = oldLength; addedIndex <= index; addedIndex++) {
            added.push({
              index: addedIndex,
              value: addedIndex === index ? (value as T[number]) : undefined,
            });
          }

          getEvents(currentTarget).emit("add", added);
          return true;
        }

        getEvents(currentTarget).emit("update", [
          {
            index,
            value: value as T[number],
          },
        ]);

        return true;
      },

      deleteProperty: (currentTarget, property): boolean => {
        const index = getArrayIndex(property);

        if (index === undefined || !(index in currentTarget)) {
          return Reflect.deleteProperty(currentTarget, property);
        }

        const deleted = Reflect.deleteProperty(currentTarget, property);

        if (deleted) {
          getEvents(currentTarget).emit("update", [
            {
              index,
              value: undefined,
            },
          ]);
        }

        return deleted;
      },
    });

    observableArrayEvents.set(proxy, events);

    return proxy;
  }

  public onUpdate(callback: ObservableArrayEvents<T>["update"]): () => void {
    const events = getEvents(this);
    events.addListener("update", callback);

    return () => {
      events.removeListener("update", callback);
    };
  }

  public onAdd(callback: ObservableArrayEvents<T>["add"]): () => void {
    const events = getEvents(this);
    events.addListener("add", callback);

    return () => {
      events.removeListener("add", callback);
    };
  }

  public onRemove(callback: ObservableArrayEvents<T>["remove"]): () => void {
    const events = getEvents(this);
    events.addListener("remove", callback);

    return () => {
      events.removeListener("remove", callback);
    };
  }

  public push(...items: T[number][]): number {
    const index = this.length;
    const result = Array.prototype.push.apply(this, items);

    if (items.length > 0) {
      getEvents(this).emit(
        "add",
        items.map((value, offset) => ({
          index: index + offset,
          value,
        })),
      );
    }

    return result;
  }

  public pop(): T[number] | undefined {
    if (this.length === 0) {
      return undefined;
    }

    const index = this.length - 1;
    const value = Array.prototype.pop.call(this);

    getEvents(this).emit("remove", [{ index, value }]);

    return value;
  }

  public shift(): T[number] | undefined {
    if (this.length === 0) {
      return undefined;
    }

    const value = Array.prototype.shift.call(this);

    getEvents(this).emit("remove", [{ index: 0, value }]);

    return value;
  }

  public unshift(...items: T[number][]): number {
    const result = Array.prototype.unshift.apply(this, items);

    if (items.length > 0) {
      getEvents(this).emit(
        "add",
        items.map((value, index) => ({ index, value })),
      );
    }

    return result;
  }

  public splice(
    start: number,
    deleteCount?: number,
    ...items: T[number][]
  ): (T[number] | undefined)[] {
    const length = this.length;
    const index = start < 0 ? Math.max(length + start, 0) : Math.min(start, length);

    const removed: T =
      arguments.length === 1
        ? Reflect.apply(Array.prototype.splice, this, [start])
        : Reflect.apply(Array.prototype.splice, this, [start, deleteCount, ...items]);

    const events = getEvents(this);

    if (removed.length > 0) {
      events.emit(
        "remove",
        removed.map((value, offset) => ({
          index: index + offset,
          value,
        })),
      );
    }

    if (items.length > 0) {
      events.emit(
        "add",
        items.map((value, offset) => ({
          index: index + offset,
          value,
        })),
      );
    }

    return removed;
  }

  public fill(value: T[number], start?: number, end?: number): ObservableArray<T> {
    const oldValues = Array.from(this);
    const length = this.length;
    const first = normalizeIndex(start ?? 0, length);
    const last = normalizeIndex(end ?? length, length);

    Array.prototype.fill.call(this, value, start, end);

    const updates: ObservableArrayItem<T[number]>[] = [];

    for (let index = first; index < last; index++) {
      if (oldValues[index] !== this[index]) {
        updates.push({ index, value: this[index] });
      }
    }

    if (updates.length > 0) {
      getEvents(this).emit("update", updates);
    }

    return this;
  }

  public reverse(): ObservableArray<T> {
    const oldValues = Array.from(this);
    Array.prototype.reverse.call(this);

    const updates = collectChangedItems(this, oldValues);

    if (updates.length > 0) {
      getEvents(this).emit("update", updates);
    }

    return this;
  }

  public sort(compareFn?: (a: T[number], b: T[number]) => number): ObservableArray<T> {
    const oldValues = Array.from(this);
    Array.prototype.sort.call(this, compareFn);

    const updates = collectChangedItems(this, oldValues);

    if (updates.length > 0) {
      getEvents(this).emit("update", updates);
    }

    return this;
  }

  public copyWithin(targetIndex: number, start: number, end?: number): ObservableArray<T> {
    const oldValues = Array.from(this);
    Array.prototype.copyWithin.call(this, targetIndex, start, end);

    const updates = collectChangedItems(this, oldValues);

    if (updates.length > 0) {
      getEvents(this).emit("update", updates);
    }

    return this;
  }
}
}

function getEvents<T extends Primitive[]>(array: ObservableArray<T>): EventEmitter<ObservableArrayEvents<T>> {
  const events = observableArrayEvents.get(array);

  if (!events) {
    throw new Error("ObservableArray events are not initialized.");
  }

  return events as EventEmitter<ObservableArrayEvents<T>>;
}

function getArrayIndex(property: PropertyKey): number | undefined {
  if (typeof property !== "string") {
    return undefined;
  }

  const index = Number(property);

  if (!Number.isInteger(index) || index < 0 || String(index) !== property) {
    return undefined;
  }

  return index;
}

function normalizeIndex(index: number, length: number): number {
  if (index < 0) {
    return Math.max(length + index, 0);
  }

  return Math.min(index, length);
}

function collectChangedItems<T>(target: T[], oldValues: T[]): ObservableArrayItem<T>[] {
  const updates: ObservableArrayItem<T>[] = [];

  for (let index = 0; index < target.length; index++) {
    if (oldValues[index] !== target[index]) {
      updates.push({
        index,
        value: target[index],
      });
    }
  }

  return updates;
}
