import { ObservableArray } from "./observable-array";

export interface ObservableEvent<TArgs extends unknown[] = []> {
  readonly kind: "observable-event";
  readonly args?: TArgs;
}

export function event<TArgs extends unknown[] = []>(): ObservableEvent<TArgs> {
  return Object.freeze({
    kind: "observable-event",
  }) as ObservableEvent<TArgs>;
}

type EventCallback = (...args: any[]) => void;

interface EventEmitter {
  addListener(callback: EventCallback): () => void;
  emit(...args: any[]): void;
}

interface ObservableObjectState {
  values: Record<PropertyKey, unknown>;
  events: Map<PropertyKey, EventEmitter>;
}

const states = new WeakMap<object, ObservableObjectState>();

/**
 * Наблюдаемый объект состояния и именованных событий.
 *
 * Конфигурация задаёт начальные значения свойств и event channels.
 * Event method не содержит прикладной логики: вызов метода только уведомляет
 * подписчиков соответствующего события.
 */
export class ObservableObject<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  public constructor(config: TConfig) {
    if (config instanceof ObservableObject) {
      throw new TypeError("ObservableObject cannot be wrapped in another ObservableObject.");
    }

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

      state.events.set(key, createEventEmitter());

      if (isObservableEvent(value)) {
        continue;
      }

      state.values[key] = createObservableValue(value);
    }

    const proxy = new Proxy(target, {
      get: (currentTarget, property, receiver) => {
        const currentState = getState(currentTarget);

        if (typeof property === "string" && property.startsWith("on")) {
          const eventName = findEventName(currentState.events, property);

          if (eventName !== undefined) {
            return (callback: EventCallback): (() => void) => {
              return currentState.events.get(eventName)!.addListener(callback);
            };
          }
        }

        if (currentState.values[property] !== undefined || property in currentState.values) {
          return currentState.values[property];
        }

        if (currentState.events.has(property)) {
          return createEventDispatcher(currentState.events.get(property)!);
        }

        return Reflect.get(currentTarget, property, receiver);
      },

      set: (currentTarget, property, value): boolean => {
        const currentState = getState(currentTarget);

        if (currentState.events.has(property) && !(property in currentState.values)) {
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

        currentState.events.get(property)!.emit(observableValue);

        return true;
      },

      deleteProperty: (_currentTarget, property): boolean => {
        const currentState = getState(target);

        if (property in currentState.values || currentState.events.has(property)) {
          throw new TypeError(`Cannot delete property "${String(property)}" from ObservableObject.`);
        }

        return true;
      },

      has: (currentTarget, property): boolean => {
        const currentState = getState(currentTarget);

        return (
          property in currentState.values ||
          currentState.events.has(property) ||
          Reflect.has(currentTarget, property)
        );
      },

      ownKeys: (currentTarget): PropertyKey[] => {
        const currentState = getState(currentTarget);

        return [
          ...Reflect.ownKeys(currentTarget),
          ...Reflect.ownKeys(currentState.values),
        ];
      },

      getOwnPropertyDescriptor: (currentTarget, property) => {
        const currentState = getState(currentTarget);

        if (property in currentState.values) {
          return {
            configurable: true,
            enumerable: true,
            value: currentState.values[property],
            writable: true,
          };
        }

        return Reflect.getOwnPropertyDescriptor(currentTarget, property);
      },
    });

    states.set(proxy, state);

    return proxy as ObservableObject<TConfig>;
  }

  /**
   * Подписаться на событие по его имени.
   *
   * Для публичного API ObservableObject также генерирует короткую форму
   * on<EventName>, например onTemperature или onReset.
   */
  public on(eventName: string, callback: EventCallback): () => void {
    const state = getState(this);

    const event = state.events.get(eventName);

    if (!event) {
      throw new Error(`Unknown ObservableObject event "${eventName}".`);
    }

    return event.addListener(callback);
  }
}

function createObservableValue(value: unknown): unknown {
  if (isPlainObject(value)) {
    return new ObservableObject(value);
  }

  if (Array.isArray(value)) {
    return new ObservableArray(...(value as unknown[]) as never[]);
  }

  return value;
}

function createEventDispatcher(event: EventEmitter): (...args: any[]) => void {
  return (...args: any[]): void => {
    event.emit(...args);
  };
}

function createEventEmitter(): EventEmitter {
  const listeners = new Set<EventCallback>();

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

function findEventName(events: Map<PropertyKey, EventEmitter>, property: string): PropertyKey | undefined {
  if (property.length <= 2) {
    return undefined;
  }

  const eventName = property.slice(2);
  const candidate = eventName.charAt(0).toLowerCase() + eventName.slice(1);

  for (const key of events.keys()) {
    if (key === candidate) {
      return key;
    }
  }

  return undefined;
}

function isObservableEvent(value: unknown): value is ObservableEvent {
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
