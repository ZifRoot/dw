import { Throttler } from "./throttler";

const throttlerSymbol = Symbol("eventThrottler");

type ThrottleClass = { new (...args: any[]): {} };

/** Create a per-instance Throttler for methods decorated with @ThrottledMethod. */
export function CreateEventThrottle(minMs: number, maxMs?: number) {
  return function <T extends ThrottleClass>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        (this as any)[throttlerSymbol] = new Throttler(minMs, maxMs);
      }
    };
  };
}

/** Inject a shared Throttler into decorated instances. */
export function InjectEventThrottle(instance: Throttler) {
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
    const throttler = this[throttlerSymbol] as Throttler | undefined;
    if (!throttler) {
      throw new Error("No Throttler found. Use @CreateEventThrottle or @InjectEventThrottle on the class.");
    }
    return throttler.throttle(() => original.apply(this, args));
  };
}

/** Retrieve the Throttler injected into an instance by a class decorator. */
export function getEventThrottler(instance: object): Throttler | undefined {
  return (instance as any)[throttlerSymbol];
}

/** @deprecated Use CreateEventThrottle. */
export const CreateThrottle = CreateEventThrottle;
/** @deprecated Use InjectEventThrottle. */
export const InjectThrottle = InjectEventThrottle;
/** @deprecated Use getEventThrottler. */
export const getThrottler = getEventThrottler;
