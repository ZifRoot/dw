type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

type Property<T extends Primitive[]> = Extract<keyof T, number>;

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
 * Минимальный типизированный emitter для ObservableArray.
 *
 * ObservableArray не хранит подписчиков самостоятельно.
 * Все операции подписки и публикации выполняются через этот объект.
 */
class EventEmitter<TEventMap extends Record<string, unknown>> {
  private readonly listeners = new Map<
    keyof TEventMap,
    Set<(payload: TEventMap[keyof TEventMap]) => void>
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

    listeners.add(callback as (payload: TEventMap[keyof TEventMap]) => void);
  }

  public removeListener<K extends keyof TEventMap>(
    eventName: K,
    callback: TEventMap[K],
  ): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    listeners.delete(
      callback as (payload: TEventMap[keyof TEventMap]) => void,
    );

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  public emit<K extends keyof TEventMap>(
    eventName: K,
    payload: Parameters<TEventMap[K] & ((...args: never[]) => unknown)>[0],
  ): void {
    const listeners = this.listeners.get(eventName);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(payload);
    }
  }
}

export class ObservableArray<T extends Primitive[]>
  extends Array<T[number]> {
  private readonly events: EventEmitter<ObservableArrayEvents<T>>;
  private readonly proxy: ObservableArray<T>;

  public constructor(
    values: T,
    events: EventEmitter<ObservableArrayEvents<T>>,
  ) {
    super(...values);

    this.events = events;

    const target = this;

    Object.assign(target, {
      onUpdate: (callback: ObservableArrayEvents<T>["update"]): (() => void) => {
        this.events.addListener("update", callback);

        return () => {
          this.events.removeListener("update", callback);
        };
      },

      onAdd: (callback: ObservableArrayEvents<T>["add"]): (() => void) => {
        this.events.addListener("add", callback);

        return () => {
          this.events.removeListener("add", callback);
        };
      },

      onRemove: (callback: ObservableArrayEvents<T>["remove"]): (() => void) => {
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

      splice: (
        start: number,
        deleteCount?: number,
        ...items: T[number][]
      ): (T[number] | undefined)[] => {
        const length = target.length;
        const index =
          start < 0
            ? Math.max(length + start, 0)
            : Math.min(start, length);

        const removed =
          arguments.length === 1
            ? Array.prototype.splice.call(target, start)
            : Array.prototype.splice.call(
                target,
                start,
                deleteCount,
                ...items,
              );

        if (removed.length > 0) {
          this.events.emit(
            "remove",
            removed.map((value, offset) => ({
              index: index + offset,
              value,
            })),
          );
        }

        if (items.length > 0) {
          this.events.emit(
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
        const length = target.length;
        const first = normalizeIndex(start ?? 0, length);
        const last = normalizeIndex(end ?? length, length);

        Array.prototype.fill.call(target, value, start, end);

        const updates: ObservableArrayItem<T[number]>[] = [];

        for (let index = first; index < last; index++) {
          if (target[index] !== value) {
            continue;
          }

          updates.push({
            index,
            value,
          });
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

    const proxy = new Proxy(target, {
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

        const oldValue = currentTarget[index];

        if (oldValue === value) {
          return true;
        }

        currentTarget[index] = value as T[number];

        this.events.emit("update", [
          {
            index: index as Property<T>,
            value: value as T[number],
          },
        ]);

        return true;
      },
    });

    this.proxy = proxy;

    return proxy;
  }

  public onUpdate(
    callback: ObservableArrayEvents<T>["update"],
  ): () => void {
    this.events.addListener("update", callback);

    return () => {
      this.events.removeListener("update", callback);
    };
  }

  public onAdd(
    callback: ObservableArrayEvents<T>["add"],
  ): () => void {
    this.events.addListener("add", callback);

    return () => {
      this.events.removeListener("add", callback);
    };
  }

  public onRemove(
    callback: ObservableArrayEvents<T>["remove"],
  ): () => void {
    this.events.addListener("remove", callback);

    return () => {
      this.events.removeListener("remove", callback);
    };
  }
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
