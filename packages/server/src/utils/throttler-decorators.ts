// throttler-decorators.ts
import { Throttler } from "./throttler";

const throttlerSymbol = Symbol("throttler");

/**
 * Декоратор класса: создаёт новый Throttler с заданным интервалом.
 * @param minMs минимальный интервал (мс)
 * @param maxMs максимальный интервал (опционально)
 */
export function CreateThrottle(minMs: number, maxMs?: number) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const throttler = new Throttler(minMs, maxMs);
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        (this as any)[throttlerSymbol] = throttler;
      }
    };
  };
}

/**
 * Декоратор класса: использует готовый экземпляр Throttler (общий для нескольких классов).
 * @param instance внешний Throttler
 */
export function InjectThrottle(instance: Throttler) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        (this as any)[throttlerSymbol] = instance;
      }
    };
  };
}

/**
 * Декоратор метода: применяет ограничение частоты вызовов.
 */
export function ThrottledMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  if (typeof original !== "function") {
    throw new Error("@ThrottledMethod can only be applied to methods");
  }

  descriptor.value = async function (this: any, ...args: any[]) {
    const throttler = this[throttlerSymbol] as Throttler | undefined;
    if (!throttler) {
      throw new Error("No Throttler found. Use @CreateThrottle or @InjectThrottle on the class.");
    }
    return throttler.throttle(() => original.apply(this, args));
  };
}

/**
 * Извлекает Throttler из экземпляра, созданного с помощью CreateThrottle или InjectThrottle.
 * @param instance экземпляр класса, декорированного соответствующим образом
 * @returns Throttler или undefined, если не найден
 */
export function getThrottler(instance: object): Throttler | undefined {
  return (instance as any)[throttlerSymbol];
}
