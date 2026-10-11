import {
  EventThrottler,
  type EventThrottlerOptions,
} from "./event-throttler";

const eventThrottlerSymbol = Symbol("eventThrottler");

/**
 * Class decorator: creates one EventThrottler shared by instances of the class.
 * Decorated publisher methods send their first argument to its event buffer.
 */
export function CreateEventThrottle<T>(options: EventThrottlerOptions<T>) {
  return function <TConstructor extends { new (...args: any[]): object }>(
    constructor: TConstructor,
  ) {
    const eventThrottler = new EventThrottler(options);
    return class extends constructor {
      public constructor(...args: any[]) {
        super(...args);
        (this as any)[eventThrottlerSymbol] = eventThrottler;
      }
    };
  };
}

/**
 * Class decorator: injects an existing EventThrottler, allowing multiple
 * classes to publish into the same aggregation buffer and throttle queue.
 */
export function InjectEventThrottle<T>(instance: EventThrottler<T>) {
  return function <TConstructor extends { new (...args: any[]): object }>(
    constructor: TConstructor,
  ) {
    return class extends constructor {
      public constructor(...args: any[]) {
        super(...args);
        (this as any)[eventThrottlerSymbol] = instance;
      }
    };
  };
}

/**
 * Method decorator: treats the method as an event publisher.
 *
 * The original method is not executed. Its first argument is pushed into the
 * shared EventThrottler and the configured onEmit callback handles aggregation.
 */
export function EventThrottledMethod(
  _target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): void {
  if (typeof descriptor.value !== "function") {
    throw new Error("@EventThrottledMethod can only be applied to methods");
  }

  descriptor.value = function (this: object, ...args: unknown[]): void {
    const eventThrottler = (this as any)[eventThrottlerSymbol] as
      | EventThrottler<unknown>
      | undefined;

    if (!eventThrottler) {
      throw new Error(
        "No EventThrottler found. Use @CreateEventThrottle or @InjectEventThrottle on the class.",
      );
    }
    if (args.length === 0) {
      throw new Error(`@EventThrottledMethod requires an event argument: ${String(propertyKey)}`);
    }

    eventThrottler.push(args[0]);
  };
}

/** Returns the EventThrottler attached by CreateEventThrottle or InjectEventThrottle. */
export function getEventThrottler<T = unknown>(
  instance: object,
): EventThrottler<T> | undefined {
  return (instance as any)[eventThrottlerSymbol] as EventThrottler<T> | undefined;
}
