/**
 * LINQ-подобные расширения для Generator.
 *
 * Методы работают лениво: следующий элемент исходного генератора
 * запрашивается только тогда, когда он нужен следующей операции.
 */

export {};

declare global {
  interface Generator<T, TReturn = any, TNext = unknown> {
    /**
     * Пропускает указанное количество элементов генератора.
     *
     * @param count - количество элементов, которые нужно пропустить
     * @returns Новый генератор
     */
    Skip(count: number): Generator<T>;

    /**
     * Возвращает не более указанного количества элементов генератора.
     *
     * @param count - максимальное количество элементов
     * @returns Новый генератор
     */
    Take(count: number): Generator<T>;
  }
}

/**
 * Пропускает первые `count` элементов генератора.
 *
 * @param generator - исходный генератор
 * @param count - количество элементов, которые нужно пропустить
 * @returns Новый генератор
 */
function* skip<T>(generator: Generator<T>, count: number): Generator<T> {
  const amount = Math.max(0, Math.floor(count));

  for (let index = 0; index < amount; index++) {
    const result = generator.next();

    if (result.done) {
      return;
    }
  }

  while (true) {
    const result = generator.next();

    if (result.done) {
      return;
    }

    yield result.value;
  }
}

/**
 * Возвращает не более `count` элементов генератора.
 *
 * @param generator - исходный генератор
 * @param count - максимальное количество элементов
 * @returns Новый генератор
 */
function* take<T>(generator: Generator<T>, count: number): Generator<T> {
  const amount = Math.max(0, Math.floor(count));

  for (let index = 0; index < amount; index++) {
    const result = generator.next();

    if (result.done) {
      return;
    }

    yield result.value;
  }
}

/**
 * Добавляет LINQ-подобные методы к Generator.
 */
if (!(Generator.prototype as Generator<unknown>).Skip) {
  Object.defineProperty(Generator.prototype, "Skip", {
    value: function <T>(this: Generator<T>, count: number): Generator<T> {
      return skip(this, count);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!(Generator.prototype as Generator<unknown>).Take) {
  Object.defineProperty(Generator.prototype, "Take", {
    value: function <T>(this: Generator<T>, count: number): Generator<T> {
      return take(this, count);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export { skip, take };
