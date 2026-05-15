// ============================================================
// 1. Рабочая лошадка БЕЗ this – состояние хранится в замыкании
// ============================================================
export function createSingleRunner<TArgs extends any[], TReturn>(fn: (...args: TArgs) => Promise<TReturn>): (...args: TArgs) => Promise<TReturn> {
  let running: Promise<TReturn> | null = null;

  return async (...args: TArgs) => {
    if (running) return running;
    running = fn(...args);
    try {
      return await running;
    } finally {
      running = null;
    }
  };
}

// ============================================================
// 2. Рабочая лошадка С this – состояние в экземпляре по ключу
// ============================================================
export function createSingleCallGuard<This, Args extends any[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return>,
  storageKey: symbol,
): (this: This, ...args: Args) => Promise<Return> {
  return function (this: This, ...args: Args): Promise<Return> {
    const existing: Promise<Return> | undefined = (this as any)[storageKey];
    if (existing) return existing;

    const promise = fn.apply(this, args);
    (this as any)[storageKey] = promise;

    promise.finally(() => {
      delete (this as any)[storageKey];
    });

    return promise;
  };
}

// ============================================================
// 3. Сторожевой объект (ExecutionGuard)
// ============================================================
export class ExecutionGuard {
  private running: Promise<any> | null = null;

  tryStart<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) return this.running;
    this.running = fn();
    this.running.finally(() => (this.running = null));
    return this.running;
  }
}

// ============================================================
// 4. Рабочая лошадка, использующая готовый Guard
// ============================================================
export function createGuardedRunner<This, Args extends any[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return>,
  guard: ExecutionGuard,
): (this: This, ...args: Args) => Promise<Return> {
  return function (this: This, ...args: Args): Promise<Return> {
    return guard.tryStart(() => fn.apply(this, args));
  };
}

// ============================================================
// 5. Декораторы
// ============================================================

// 5.1 Декоратор с Symbol (использует createSingleCallGuard)
export function SingleExecution(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  const guardKey = Symbol(`guard_${propertyKey}`);
  descriptor.value = createSingleCallGuard(originalMethod, guardKey);
}

// 5.2 Декоратор с передачей внешнего Guard (использует createGuardedRunner)
export function SingleGuarded(guard: ExecutionGuard) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createGuardedRunner(originalMethod, guard);
  };
}
