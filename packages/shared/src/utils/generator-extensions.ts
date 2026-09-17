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

    /**
     * Преобразует каждый элемент генератора.
     *
     * Аналог LINQ Select.
     *
     * @param selector - функция преобразования элемента
     * @returns Новый генератор с преобразованными элементами
     */
    Select<TResult>(selector: (value: T, index: number) => TResult): Generator<TResult>;

    /**
     * Возвращает только элементы, удовлетворяющие условию.
     *
     * Аналог LINQ Where.
     *
     * @param predicate - функция проверки элемента
     * @returns Новый генератор с отфильтрованными элементами
     */
    Where(predicate: (value: T, index: number) => boolean): Generator<T>;
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
 * Преобразует каждый элемент генератора.
 *
 * @param generator - исходный генератор
 * @param selector - функция преобразования элемента
 * @returns Новый генератор с преобразованными элементами
 */
function* select<T, TResult>(
  generator: Generator<T>,
  selector: (value: T, index: number) => TResult,
): Generator<TResult> {
  let index = 0;

  while (true) {
    const result = generator.next();

    if (result.done) {
      return;
    }

    yield selector(result.value, index++);
  }
}

/**
 * Возвращает только элементы, удовлетворяющие условию.
 *
 * @param generator - исходный генератор
 * @param predicate - функция проверки элемента
 * @returns Новый генератор с отфильтрованными элементами
 */
function* where<T>(
  generator: Generator<T>,
  predicate: (value: T, index: number) => boolean,
): Generator<T> {
  let index = 0;

  while (true) {
    const result = generator.next();

    if (result.done) {
      return;
    }

    const currentIndex = index++;

    if (predicate(result.value, currentIndex)) {
      yield result.value;
    }
  }
}

/**
 * Получает прототип нативных генераторов.
 *
 * `Generator` является типом TypeScript и не существует как глобальный
 * конструктор в JavaScript, поэтому прототип необходимо получить
 * от экземпляра генератора.
 */
const generatorPrototype = Object.getPrototypeOf(function* () {}());

/**
 * Добавляет LINQ-подобные методы к Generator.
 */
if (!generatorPrototype.Skip) {
  Object.defineProperty(generatorPrototype, "Skip", {
    value: function <T>(this: Generator<T>, count: number): Generator<T> {
      return skip(this, count);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!generatorPrototype.Take) {
  Object.defineProperty(generatorPrototype, "Take", {
    value: function <T>(this: Generator<T>, count: number): Generator<T> {
      return take(this, count);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!generatorPrototype.Select) {
  Object.defineProperty(generatorPrototype, "Select", {
    value: function <T, TResult>(
      this: Generator<T>,
      selector: (value: T, index: number) => TResult,
    ): Generator<TResult> {
      return select(this, selector);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!generatorPrototype.Where) {
  Object.defineProperty(generatorPrototype, "Where", {
    value: function <T>(
      this: Generator<T>,
      predicate: (value: T, index: number) => boolean,
    ): Generator<T> {
      return where(this, predicate);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export { skip, take, select, where };
