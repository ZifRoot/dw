type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export type Property<T extends Primitive[]> = Extract<keyof T, number>;

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
  }
> {
  private readonly listeners = new Map<
    keyof TEventMap,
    Set<TEventMap[keyof TEventMap]>
  >();

  public addListener<K extends keyof TEventMap>(
    eventName: K,
    callback: TEventMap[K],
  ): void {
    let listeners = this.listeners.get(eventName);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(eventName, listeners);
    }

    listeners.add(callback);
  }

  public removeListener<K extends keyof TEventMap>(
    eventName: K,
    callback: TEventMap[K],
  ): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    listeners.delete(callback);

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  public emit<K extends keyof TEventMap>(
    eventName: K,
    ...args: Parameters<TEventMap[K]>
  ): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(...args);
    }
  }
}

export class ObservableArray<T extends Primitive[]>
  extends Array<T[number]> {
  private readonly events = new EventEmitter<ObservableArrayEvents<T>>();

  public constructor(values: T = [] as unknown as T) {
    if (typeof values === "number") {
      super(values);
    } else {
      super(...values);
    }

    const target = this;
    const events = this.events;
    let proxy: ObservableArray<T>;

    Object.assign(target, {
      onUpdate: (
        callback: ObservableArrayEvents<T>["update"],
      ): (() => void) => {
        this.events.addListener("update", callback);

        return () => {
          this.events.removeListener("update", callback);
        };
      },

      onAdd: (
        callback: ObservableArrayEvents<T>["add"],
      ): (() => void) => {
        this.events.addListener("add", callback);

        return () => {
          this.events.removeListener("add", callback);
        };
      },

      onRemove: (
        callback: ObservableArrayEvents<T>["remove"],
      ): (() => void) => {
        this.events.addListener("remove", callback);

        return () => {
          this.events.removeListener("remove", callback);
        };
      },

      push: (...items: T[number][]): number => {
        const index = target.length;
        const result = Array.prototype.push.apply(target, items);

        if (items.length > 0) {
          this.events.emit(
            "add",
            items.map((value, offset) => ({
              index: index + offset,
              value,
            })),
          );
        }

        return result;
      },

      pop: (): T[number] | undefined => {
        if (target.length === 0) {
          return undefined;
        }

        const index = target.length - 1;
        const value = Array.prototype.pop.call(target);

        this.events.emit("remove", [
          {
            index,
            value,
          },
        ]);

        return value;
      },

      shift: (): T[number] | undefined => {
        if (target.length === 0) {
          return undefined;
        }

        const value = Array.prototype.shift.call(target);

        this.events.emit("remove", [
          {
            index: 0,
            value,
          },
        ]);

        return value;
      },

      unshift: (...items: T[number][]): number => {
        const result = Array.prototype.unshift.apply(target, items);

        if (items.length > 0) {
          this.events.emit(
            "add",
            items.map((value, index) => ({
              index,
              value,
            })),
          );
        }

        return result;
      },

      splice: function (
        start: number,
        deleteCount?: number,
        ...items: T[number][]
      ): (T[number] | undefined)[] {
        const length = target.length;
        const index =
          start < 0
            ? Math.max(length + start, 0)
            : Math.min(start, length);

        const removed: T =
          arguments.length === 1
            ? Reflect.apply(Array.prototype.splice, target, [start])
            : Reflect.apply(Array.prototype.splice, target, [
                start,
                deleteCount,
                ...items,
              ]);

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
      },

      fill: (
        value: T[number],
        start?: number,
        end?: number,
      ): ObservableArray<T> => {
        const oldValues = Array.from(target);
        const length = target.length;
        const first = normalizeIndex(start ?? 0, length);
        const last = normalizeIndex(end ?? length, length);

        Array.prototype.fill.call(target, value, start, end);

        const updates: ObservableArrayItem<T[number]>[] = [];

        for (let index = first; index < last; index++) {
          if (oldValues[index] !== target[index]) {
            updates.push({
              index,
              value: target[index],
            });
          }
        }

        if (updates.length > 0) {
          this.events.emit("update", updates);
        }

        return proxy;
      },

      reverse: (): ObservableArray<T> => {
        const oldValues = Array.from(target);

        Array.prototype.reverse.call(target);

        const updates = collectChangedItems(target, oldValues);

        if (updates.length > 0) {
          this.events.emit("update", updates);
        }

        return proxy;
      },

      sort: (
        compareFn?: (
          a: T[number],
          b: T[number],
        ) => number,
      ): ObservableArray<T> => {
        const oldValues = Array.from(target);

        Array.prototype.sort.call(target, compareFn);

        const updates = collectChangedItems(target, oldValues);

        if (updates.length > 0) {
          this.events.emit("update", updates);
        }

        return proxy;
      },

      copyWithin: (
        targetIndex: number,
        start: number,
        end?: number,
      ): ObservableArray<T> => {
        const oldValues = Array.from(target);

        Array.prototype.copyWithin.call(
          target,
          targetIndex,
          start,
          end,
        );

        const updates = collectChangedItems(target, oldValues);

        if (updates.length > 0) {
          this.events.emit("update", updates);
        }

        return proxy;
      },
    });

    proxy = new Proxy(target, {
      set: (
        currentTarget,
        property,
        value,
      ): boolean => {
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
            this.events.emit("remove", removed);

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

          this.events.emit("add", added);

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
              value:
                addedIndex === index
                  ? (value as T[number])
                  : undefined,
            });
          }

          this.events.emit("add", added);

          return true;
        }

        this.events.emit("update", [
          {
            index,
            value: value as T[number],
          },
        ]);

        return true;
      },

      deleteProperty: (
        currentTarget,
        property,
      ): boolean => {
        const index = getArrayIndex(property);

        if (index === undefined || !(index in currentTarget)) {
          return Reflect.deleteProperty(currentTarget, property);
        }

        const deleted = Reflect.deleteProperty(currentTarget, property);

        if (deleted) {
          this.events.emit("update", [
            {
              index,
              value: undefined,
            },
          ]);
        }

        return deleted;
      },
    });

    return proxy;
  }
}

export interface ObservableArray<T extends Primitive[]> {
  onUpdate(
    callback: ObservableArrayEvents<T>["update"],
  ): () => void;

  onAdd(
    callback: ObservableArrayEvents<T>["add"],
  ): () => void;

  onRemove(
    callback: ObservableArrayEvents<T>["remove"],
  ): () => void;
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

function collectChangedItems<T>(
  target: T[],
  oldValues: T[],
): ObservableArrayItem<T>[] {
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
