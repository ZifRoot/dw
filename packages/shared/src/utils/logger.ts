/**
 * Запускает функцию с логированием начала, успешного завершения и ошибки.
 *
 * В отличие от safe-обёрток, ошибка после логирования пробрасывается вызывающему коду.
 *
 * @param fn Функция, которую необходимо выполнить.
 * @param label Необязательная метка для сообщений лога. По умолчанию используется имя функции.
 * @returns Обёрнутая функция с теми же аргументами и возвращаемым значением.
 */
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

/**
 * Создаёт обёртку для метода с логированием и опциональным подавлением ошибок.
 *
 * Метод логирует начало выполнения, успешное завершение и ошибку.
 * Если safe=true, ошибка не пробрасывается и наружу возвращается null.
 * Если safe=false, исходная ошибка пробрасывается дальше.
 *
 * @param fn Метод, который необходимо обернуть.
 * @param label Необязательная метка для сообщений лога.
 * @param param Если true, в сообщение о начале выполнения добавляются аргументы метода.
 * @param safe Если true, ошибки подавляются и преобразуются в null.
 * @returns Обёрнутый метод.
 */
export function createLoggedMethodRunner<This, Args extends any[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return> | Return,
  label?: string,
  param = false,
  safe = false,
): (this: This, ...args: Args) => Promise<Return> {
  const logLabel = label || fn.name || "anonymous";

  return async function (this: This, ...args: Args): Promise<Return> {
    const param_str = param ? ` | ${JSON.stringify(args)}` : "";
    console.log(`[${logLabel}] запустилась${param_str}`);
    const start = performance.now();

    try {
      const result = await fn.apply(this, args);
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[${logLabel}] завершилась (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2);
      console.error(`[${logLabel}] ошибка через ${duration}ms`, error);
      if (safe) return null as Return;
      throw error;
    }
  };
}

/**
 * Безопасная обёртка, которая выполняет функцию и не позволяет исключению
 * выйти наружу.
 *
 * Успешный результат возвращается без изменений.
 * При исключении ошибка записывается в stderr, после чего возвращается null.
 *
 * @param fn Функция, которую необходимо выполнить безопасно.
 * @returns Результат функции или null при ошибке.
 */
export function _safe<This, Args extends any[], Return>(
  fn: (this: This, ...args: Args) => Promise<Return> | Return,
): (this: This, ...args: Args) => Promise<Return> {
  return async function (this: This, ...args: Args): Promise<Return> {
    try {
      const result = await fn.apply(this, args);
      return result;
    } catch (error) {
      console.error(error);
    }
    return null as Return;
  };
}

/**
 * Декоратор обычного логирования метода.
 *
 * Логирует начало, успешное завершение и ошибку метода.
 * Ошибка не подавляется и передаётся вызывающему коду.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function LogExecutionName(label?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = createLoggedMethodRunner(originalMethod, label ?? propertyKey);
  };
}

/**
 * Декоратор обычного логирования метода.
 *
 * Логирует начало, успешное завершение и ошибку метода.
 * Ошибка не подавляется и передаётся вызывающему коду.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, false);
}

/**
 * Декоратор безопасного логирования метода.
 *
 * Логирует начало, успешное завершение и ошибку метода.
 * При ошибке исключение подавляется, а обёртка возвращает null.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function LogSafe(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, false, true);
}

/**
 * Декоратор безопасного логирования метода с аргументами.
 *
 * Дополнительно записывает сериализованные аргументы метода при начале выполнения.
 * При ошибке исключение подавляется, а обёртка возвращает null.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function LogParamSafe(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, true, true);
}

/**
 * Декоратор логирования метода с аргументами.
 *
 * Дополнительно записывает сериализованные аргументы метода при начале выполнения.
 * При ошибке исключение не подавляется и передаётся вызывающему коду.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function LogParam(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = createLoggedMethodRunner(originalMethod, propertyKey, true);
}

/**
 * Декоратор безопасного выполнения метода без подробного логирования.
 *
 * Успешный результат возвращается без изменений.
 * При исключении ошибка записывается в stderr, исключение подавляется,
 * а обёртка возвращает null.
 *
 * @param target Прототип класса, предоставляемый механизмом декораторов.
 * @param propertyKey Имя декорируемого метода.
 * @param descriptor Дескриптор декорируемого метода.
 */
export function Safe(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = _safe(originalMethod);
}

/**
 * Аналог LogSafe, но с кастомной label.
 *
 * Логирует старт, успешное завершение и ошибку.
 * При ошибке исключение подавляется и возвращается null.
 *
 * @param label Метка для логов. Если не задана — используется имя метода.
 * @returns Декоратор метода.
 */
export function LogSafeName(label?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createLoggedMethodRunner(descriptor.value, label ?? propertyKey, false, true);
  };
}

/**
 * Аналог LogParam, но с кастомной label.
 *
 * Логирует старт, успешное завершение и ошибку, включая сериализованные аргументы.
 * При ошибке исключение пробрасывается вызывающему коду.
 *
 * @param label Метка для логов. Если не задана — используется имя метода.
 * @returns Декоратор метода.
 */
export function LogParamName(label?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    descriptor.value = createLoggedMethodRunner(descriptor.value, label ?? propertyKey, true, false);
  };
}
