import { EventThrottler } from "./event-throttler";

const throttlerSymbol = Symbol("eventThrottler");

type ThrottleClass = { new (...args: any[]): {} };

/** Create a per-instance EventThrottler for methods decorated with @ThrottledMethod. */
export function CreateEventThrottle(minMs: number, maxMs?: number) {
  return function <T extends ThrottleClass>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        (this as any)[throttlerSymbol] = new EventThrottler(minMs, maxMs);
      }
    };
  };
}

/** Inject a shared EventThrottler into decorated instances. */
export function InjectEventThrottle(instance: EventThrottler<any>) {
  return function <T extends ThrottleClass>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        (this as any)[throttlerSymbol] = instance;
      }
    };
  };
}

/** Apply the instance's EventThrottler to a method call. */
export function ThrottledMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const original = descriptor.value;
  if (typeof original !== "function") {
    throw new Error("@ThrottledMethod can only be applied to methods");
  }

  descriptor.value = async function (this: any, ...args: any[]) {
    const throttler = this[throttlerSymbol] as EventThrottler<any> | undefined;
    if (!throttler) {
      throw new Error("No EventThrottler found. Use @CreateEventThrottle or @InjectEventThrottle on the class.");
    }
    return throttler.throttle(() => original.apply(this, args));
  };
}

/** Retrieve the EventThrottler injected into an instance by a class decorator. */
export function getEventThrottler(instance: object): EventThrottler<any> | undefined {
  return (instance as any)[throttlerSymbol];
}

/** @deprecated Use CreateEventThrottle. */
export const CreateThrottle = CreateEventThrottle;
/** @deprecated Use InjectEventThrottle. */
export const InjectThrottle = InjectEventThrottle;
/** @deprecated Use getEventThrottler. */
export const getThrottler = getEventThrottler;
