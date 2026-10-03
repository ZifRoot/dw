type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type ObservableObjectListener<T> = (value: T, previousValue: T) => void;

export interface ObservableEvent<TArgs extends unknown[] = []> {
  readonly kind: "observable-event";
  readonly args?: TArgs;
}

export function event<TArgs extends unknown[] = []>(): ObservableEvent<TArgs> {
  return Object.freeze({
    kind: "observable-event",
  }) as ObservableEvent<TArgs>;
}

type AnyEvent = ObservableEvent<unknown[]>;

interface EventEmitter {
  addListener(callback: (...args: any[]) => void): () => void;
  emit(...args: any[]): void;
}

interface ObservableObjectState {
  values: Record<PropertyKey, unknown>;
  events: Map<PropertyKey, EventEmitter>;
}

const states = new WeakMap<object, ObservableObjectState>();

/**
 * ObservableObject provides observable properties and event methods.
 *
 * The constructor configuration describes initial state values and event
 * channels. Event channels do not contain application logic: calling an event
 * method only notifies its subscribers.
 */
export class ObservableObject<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  public constructor(config: TConfig) {
    if (!isPlainObject(config)) {
      throw new TypeError("ObservableObject configuration must be a plain object.");
    }

    const target = Object.create(new.target.prototype) as object;
    const state: ObservableObjectState = {
      values: Object.create(null) as Record<PropertyKey, unknown>,
      events: new Map(),
    };

    states.set(target, state);

    for (const key of Reflect.ownKeys(config)) {
      const value = config[key as keyof TConfig];

      if (isObservableEvent(value)) {
        state.events.set(key, createEventEmitter());
        continue;
      }

      state.values[key] = createObservableValue(value);
    }

    const proxy = new Proxy(target, {
      get: (currentTarget, property, receiver) => {
        const currentState = getState(currentTarget);

        if (currentState.events.has(property)) {
          return createEventDispatcher(currentState.events.get(property)!);
        }

        if (property in currentState.values) {
          return currentState.values[property];
        }

        return Reflect.get(currentTarget, property, receiver);
      },

      set: (currentTarget, property, value): boolean => {
        const currentState = getState(currentTarget);

        if (currentState.events.has(property)) {
          throw new TypeError(`Cannot assign to event method "${String(property)}".`);
        }

        if (!(property in currentState.values)) {
          throw new TypeError(`Cannot add property "${String(property)}" to ObservableObject.`);
        }

        const oldValue = currentState.values[property];

        if (Object.is(oldValue, value)) {
          return true;
        }

        const observableValue = createObservableValue(value);
        currentState.values[property] = observableValue;

        notifyValueChange(currentState, property, observableValue, oldValue);

        return true;
      },

      deleteProperty: (_currentTarget, property): boolean => {
        const currentState = getState(target);

        if (property in currentState.values || currentState.events.has(property)) {
          throw new TypeError(`Cannot delete property "${String(property)}" from ObservableObject.`);
        }

        return true;
      },
    });

    states.set(proxy, state);

    return proxy as ObservableObject<TConfig>;
  }

  public on<K extends string>(eventName: K, callback: (...args: any[]) => void): () => void {
    const state = getState(this);

    if (!state.events.has(eventName)) {
      throw new Error(`Unknown ObservableObject event "${eventName}".`);
    }

    return state.events.get(eventName)!.addListener(callback);
  }
}

function createObservableValue(value: unknown): unknown {
  if (isPlainObject(value)) {
    return new ObservableObject(value);
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value;
}

function notifyValueChange(
  state: ObservableObjectState,
  property: PropertyKey,
  value: unknown,
  previousValue: unknown,
): void {
  const event = state.events.get(property);

  if (!event) {
    return;
  }

  event.emit(value, previousValue);
}

function createEventDispatcher(event: EventEmitter): (...args: any[]) => void {
  return (...args: any[]): void => {
    event.emit(...args);
  };
}

function createEventEmitter(): EventEmitter {
  const listeners = new Set<(...args: any[]) => void>();

  return {
    addListener(callback): () => void {
      listeners.add(callback);

      return () => {
        listeners.delete(callback);
      };
    },

    emit(...args): void {
      for (const listener of listeners) {
        listener(...args);
      }
    },
  };
}

function isObservableEvent(value: unknown): value is AnyEvent {
  return isPlainObject(value) && value.kind === "observable-event";
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function getState(object: object): ObservableObjectState {
  const state = states.get(object);

  if (!state) {
    throw new Error("ObservableObject state is not initialized.");
  }

  return state;
}
