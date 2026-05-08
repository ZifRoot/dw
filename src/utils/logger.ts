export function createLoggedRunner<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn> | TReturn,
  label?: string,
): (...args: TArgs) => Promise<TReturn> {
  const logLabel = label || fn.name || "anonymous";

  return async (...args: TArgs) => {
    console.log(`[${logLabel}] запустилась`);
    const start = performance.now();

    try {
      const result = await fn(...args);
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[${logLabel}] завершилась (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2);
      console.error(`[${logLabel}] ошибка через ${duration}ms`, error);
      throw error;
    }
  };
}

export function createLoggedMethodRunner<This, Args extends any[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return> | Return,
  label?: string,
): (this: This, ...args: Args) => Promise<Return> {
  const logLabel = label || fn.name || "anonymous";

  return async function (this: This, ...args: Args): Promise<Return> {
    console.log(`[${logLabel}] запустилась`);
    const start = performance.now();

    try {
      const result = await fn.apply(this, args);
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[${logLabel}] завершилась (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2);
      console.error(`[${logLabel}] ошибка через ${duration}ms`, error);
      throw error;
    }
  };
}

export function LogExecutionName(label?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    // Просто оборачиваем оригинальный метод через соответствующую утилиту
    descriptor.value = createLoggedMethodRunner(originalMethod, label ?? propertyKey);
  };
}

export function LogExecution(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  // Просто оборачиваем оригинальный метод через соответствующую утилиту
  descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey);
}
