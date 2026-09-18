// array-extensions.ts

/**
 * Модуль расширения прототипа Array полезными методами:
 * - uniqueBy / uniqueById – удаление дубликатов
 * - groupToMap / groupToMapEm – группировка
 * - removeByIndices – удаление элементов с колбэками
 * - shuffle – перемешивание
 * - intersection – пересечение множеств
 * - mapAsync – асинхронный маппинг с контролем параллелизма
 * - randomElement – генератор случайных элементов
 * - asGenerator – преобразование массива в генератор
 *
 * Все методы добавляются в прототип Array безопасно (с проверкой на существование)
 * и также доступны как статические функции.
 */

export {}; // делаем файл модулем

// ============================================================
// 1. Расширение глобального интерфейса Array
// ============================================================
declare global {
  interface Array<T> {
    /**
     * Возвращает новый массив с уникальными элементами по указанному ключу.
     * @param keySelector - имя поля (строковый ключ) или функция, возвращающая ключ для сравнения (строка/число/символ)
     * @param strategy - стратегия отбора: 'first' (первое вхождение) или 'last' (последнее)
     * @returns Новый массив с уникальными элементами, порядок сохранён по первому массиву
     *
     * @example
     * const arr = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 1, name: 'c' }];
     * arr.uniqueBy('id', 'first'); // [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
     * arr.uniqueBy(item => item.id, 'last'); // [{ id: 2, name: 'b' }, { id: 1, name: 'c' }]
     */
    uniqueBy<K extends keyof T | ((item: T) => PropertyKey)>(keySelector: K, strategy?: "first" | "last"): T[];

    /**
     * Группирует элементы массива по ключу.
     * @param keySelector - функция, возвращающая ключ для группировки
     * @returns Map, где ключ — результат keySelector, значение — массив элементов
     *
     * @example
     * const arr = [{ type: 'fruit', name: 'apple' }, { type: 'fruit', name: 'banana' }, { type: 'veg', name: 'carrot' }];
     * arr.groupBy(item => item.type); // Map { 'fruit' => [{...}, {...}], 'veg' => [{...}] }
     */
    groupBy<K>(keySelector: (item: T) => K): Map<K, T[]>;

    /**
     * Группирует элементы массива по ключу и преобразует каждую группу.
     * @param keySelector - функция, возвращающая ключ для группировки
     * @param em - функция, преобразующая массив элементов группы в значение Y
     * @returns Map, где ключ — результат keySelector, значение — результат em
     *
     * @example
     * const arr = [1, 2, 3, 4, 5];
     * arr.groupBy(x => x % 2 === 0 ? 'even' : 'odd', group => group.reduce((a,b)=>a+b,0));
     * // Map { 'odd' => 9, 'even' => 6 }
     */
    groupBy<K, Y>(keySelector: (item: T) => K, em: (items: T[]) => Y): Map<K, Y>;

    /**
     * Удаляет элементы по индексам, вызывая колбэки для каждого удалённого элемента
     * и для каждого элемента, который перемещается на место удалённого.
     * @param indices - массив индексов для удаления (дубликаты и некорректные значения игнорируются)
     * @param del - вызывается для каждого удалённого объекта (перед удалением)
     * @param add - вызывается для объекта, который перезаписывает удалённую позицию (с его новым индексом)
     * @remarks Метод изменяет исходный массив.
     *
     * @example
     * const arr = ['a','b','c','d'];
     * arr.removeByIndices([1,2], (x) => console.log(`Удалён ${x}`), (x, idx) => console.log(`Перемещён ${x} на ${idx}`));
     * // Удалён b, Перемещён d на 1, Удалён c (по факту arr = ['a','d'])
     */
    removeByIndices(indices: number[], del: (item: T) => void, add: (item: T, index: number) => void): void;

    /**
     * Перемешивает массив случайным образом (алгоритм Фишера–Йетса).
     * @returns Новый массив с перемешанными элементами (исходный массив не меняется)
     *
     * @example
     * const arr = [1,2,3,4,5];
     * const shuffled = arr.shuffle(); // случайный порядок
     */
    shuffle(): T[];

    /**
     * Возвращает новый массив, содержащий уникальные элементы,
     * присутствующие как в текущем массиве, так и в переданном.
     * @param other - массив для пересечения
     * @returns Массив с элементами пересечения (порядок сохраняется по первому массиву, дубликаты удалены)
     *
     * @example
     * const arr1 = [1,2,2,3,4];
     * const arr2 = [2,3,5];
     * arr1.intersection(arr2); // [2,3]
     */
    intersection(other: T[]): T[];

    /**
     * Асинхронно преобразует каждый элемент массива с помощью промис-колбэка.
     * Позволяет ограничить количество одновременно выполняющихся операций (параллелизм).
     * @param callbackfn - асинхронная функция, применяемая к каждому элементу. Принимает (значение, индекс, массив).
     * @param concurrency - максимальное количество одновременных задач. Если 0 или меньше, выполняется без ограничений.
     * @returns Promise, разрешающийся в массив результатов того же порядка, что и исходный.
     *
     * @example
     * const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
     * const result = await [1, 2, 3, 4, 5].mapAsync(async (x) => {
     *   await delay(1000);
     *   return x * 2;
     * }, 2); // Не более 2 задач одновременно
     * // result: [2, 4, 6, 8, 10]
     */
    mapAsync<U>(callbackfn: (value: T, index: number, array: T[]) => Promise<U>, concurrency?: number): Promise<U[]>;

    /**
     * Возвращает генератор, который при каждом вызове next() возвращает
     * случайный элемент текущего массива.
     *
     * Элементы могут повторяться, поскольку каждый следующий элемент
     * выбирается независимо и случайно.
     *
     * @returns Генератор случайных элементов массива
     *
     * @example
     * const array = [1, 2, 3, 4, 5];
     * const generator = array.randomElement();
     *
     * generator.next().value;
     * generator.next().value;
     * generator.next().value;
     */
    randomElement(): Generator<T>;

    /**
     * Возвращает генератор, последовательно перебирающий элементы массива.
     *
     * @returns Генератор элементов массива
     *
     * @example
     * const generator = [1, 2, 3, 4, 5].asGenerator();
     * const result = generator.Take(3);
     */
    asGenerator(): Generator<T>;
  }
}

// ============================================================
// 2. Реализация функций с JSDoc-комментариями
// ============================================================

/**
 * Возвращает новый массив с уникальными элементами по указанному ключу.
 * @param items - исходный массив
 * @param keySelector - имя поля или функция, возвращающая ключ
 * @param strategy - 'first' или 'last'
 * @returns Новый массив уникальных элементов
 */
function uniqueBy<T, K extends keyof T | ((item: T) => PropertyKey)>(items: T[], keySelector: K, strategy: "first" | "last" = "first"): T[] {
  const getKey: (item: T) => PropertyKey =
    typeof keySelector === "function"
      ? (keySelector as (item: T) => PropertyKey)
      : (item: T) => item[keySelector as keyof T] as unknown as PropertyKey;

  const map = new Map<PropertyKey, T>();

  if (strategy === "last") {
    for (const item of items) {
      map.set(getKey(item), item);
    }
  } else {
    for (const item of items) {
      const key = getKey(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Удаляет дубликаты из массива объектов, используя поле `id`.
 * @param items - массив объектов с обязательным полем `id` (строка или число)
 * @returns Новый массив с уникальными id (первое вхождение)
 */
function uniqueById<T extends { id: string | number }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/**
 * Группирует элементы массива по ключу.
 * @param array - исходный массив
 * @param keySelector - функция, возвращающая ключ для группировки
 * @returns Map с группами
 */
function groupToMap<T, K>(array: T[], keySelector: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const key = keySelector(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/**
 * Группирует элементы массива по ключу и преобразует каждую группу.
 * @param array - исходный массив
 * @param keySelector - функция, возвращающая ключ для группировки
 * @param em - функция, преобразующая группу в значение
 * @returns Map с преобразованными группами
 */
function groupToMapEm<T, K, Y>(array: T[], keySelector: (item: T) => K, em: (items: T[]) => Y): Map<K, Y> {
  const grouped = groupToMap(array, keySelector);
  const result = new Map<K, Y>();
  for (const [key, group] of grouped) {
    result.set(key, em(group));
  }
  return result;
}

/**
 * Удаляет элементы по индексам с вызовом колбэков.
 * @param array - изменяемый массив
 * @param indices - индексы элементов для удаления
 * @param del - вызывается для каждого удалённого элемента
 * @param add - вызывается для элемента, перемещённого на место удалённого
 */
function removeByIndices<T>(array: T[], indices: number[], del: (item: T) => void, add: (item: T, index: number) => void): void {
  if (indices.length === 0) return;
  const toDelete = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < array.length).sort((a, b) => b - a);

  let prev = -1;
  let len1 = array.length - 1;
  for (const idx of toDelete) {
    if (idx === prev) continue;
    prev = idx;

    const removed = array[idx];
    del(removed);

    if (idx < len1) {
      const last = array[len1];
      array[idx] = last;
      add(last, idx);
    }
    --len1;
  }
  array.length = len1 + 1;
}

/**
 * Перемешивает массив случайным образом (алгоритм Фишера–Йетса).
 * @param array - исходный массив
 * @returns Новый массив с перемешанными элементами
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Возвращает пересечение двух массивов (уникальные элементы, присутствующие в обоих).
 * @param first - первый массив
 * @param second - второй массив
 * @returns Массив элементов, присутствующих в обоих массивах (порядок по первому массиву, дубликаты удалены)
 */
function intersection<T>(first: T[], second: T[]): T[] {
  const secondSet = new Set(second);
  const result: T[] = [];
  const added = new Set<T>();
  for (const item of first) {
    if (secondSet.has(item) && !added.has(item)) {
      result.push(item);
      added.add(item);
    }
  }
  return result;
}

/**
 * Генерирует бесконечную последовательность случайных элементов массива.
 * @param array - исходный массив
 * @yields Случайный элемент массива
 */
function* randomElement<T>(array: T[]): Generator<T> {
  while (array.length > 0) {
    const index = Math.floor(Math.random() * array.length);
    yield array[index];
  }
}

/**
 * Последовательно генерирует все элементы массива.
 *
 * @param array - исходный массив
 * @yields Элементы массива в исходном порядке
 */
function* asGenerator<T>(array: T[]): Generator<T> {
  yield* array;
}

/**
 * Ошибка, содержащая частично выполненные результаты.
 */
class MapAsyncError extends Error {
  partialResults: any[];

  constructor(message: string, partialResults: any[]) {
    super(message);
    this.name = "MapAsyncError";
    this.partialResults = partialResults;
  }
}

/**
 * Асинхронно преобразует массив с ограничением параллелизма.
 * @param array - исходный массив
 * @param callbackfn - асинхронная функция преобразования
 * @param concurrency - лимит одновременных задач (0 = без лимита)
 * @returns Promise с массивом результатов
 * @throws MapAsyncError - при ошибке содержит свойство partialResults
 */
async function mapAsync<T, U>(array: T[], callbackfn: (value: T, index: number, array: T[]) => Promise<U>, concurrency: number = 0): Promise<U[]> {
  if (array.length === 0) return [];

  // 🚀 Оптимизация: если лимита нет, используем нативный Promise.all
  if (concurrency <= 0 || concurrency >= array.length) {
    return Promise.all(array.map((item, index) => callbackfn(item, index, array)));
  }

  const results: U[] = new Array(array.length);
  let currentIndex = 0;
  let activeTasks = 0;
  let isRejected = false;

  return new Promise((resolve, reject) => {
    const next = () => {
      while (!isRejected && activeTasks < concurrency && currentIndex < array.length) {
        const index = currentIndex++;
        const item = array[index];
        activeTasks++;

        Promise.resolve(callbackfn(item, index, array))
          .then((result) => {
            if (!isRejected) results[index] = result;
          })
          .catch((err) => {
            if (!isRejected) {
              isRejected = true;
              // ❌ Fail-Fast: Reject всего промиса с частичными данными
              reject(new MapAsyncError(err.message || "Task failed", results));
            }
          })
          .finally(() => {
            activeTasks--;
            if (!isRejected) {
              if (currentIndex === array.length && activeTasks === 0) {
                resolve(results);
              } else {
                queueMicrotask(next);
              }
            }
          });
      }
    };

    // Запускаем первую итерацию
    next();
  });
}

// ============================================================
// 3. Добавление методов в прототип Array (с проверками и Object.defineProperty)
// ============================================================

if (!Array.prototype.uniqueBy) {
  Object.defineProperty(Array.prototype, "uniqueBy", {
    value: function <T, K extends keyof T | ((item: T) => PropertyKey)>(this: T[], keySelector: K, strategy: "first" | "last" = "first"): T[] {
      return uniqueBy(this, keySelector, strategy);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.groupBy) {
  Object.defineProperty(Array.prototype, "groupBy", {
    value: function <T, K, Y>(this: T[], keySelector: (item: T) => K, em?: (items: T[]) => Y): Map<K, Y> | Map<K, T[]> {
      if (em) {
        return groupToMapEm(this, keySelector, em);
      }
      return groupToMap(this, keySelector) as Map<K, T[]>;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.removeByIndices) {
  Object.defineProperty(Array.prototype, "removeByIndices", {
    value: function <T>(this: T[], indices: number[], del: (item: T) => void, add: (item: T, index: number) => void): void {
      removeByIndices(this, indices, del, add);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.shuffle) {
  Object.defineProperty(Array.prototype, "shuffle", {
    value: function <T>(this: T[]): T[] {
      return shuffle(this);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.intersection) {
  Object.defineProperty(Array.prototype, "intersection", {
    value: function <T>(this: T[], other: T[]): T[] {
      return intersection(this, other);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.mapAsync) {
  Object.defineProperty(Array.prototype, "mapAsync", {
    value: function <T, U>(this: T[], callbackfn: (value: T, index: number, array: T[]) => Promise<U>, concurrency: number = 0): Promise<U[]> {
      return mapAsync(this, callbackfn, concurrency);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.randomElement) {
  Object.defineProperty(Array.prototype, "randomElement", {
    value: function <T>(this: T[]): Generator<T> {
      return randomElement(this);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

if (!Array.prototype.asGenerator) {
  Object.defineProperty(Array.prototype, "asGenerator", {
    value: function <T>(this: T[]): Generator<T> {
      return asGenerator(this);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ============================================================
// 4. Единый экспорт всех функций
// ============================================================
export { uniqueBy, uniqueById, groupToMap, groupToMapEm, removeByIndices, shuffle, intersection, mapAsync, randomElement, asGenerator };
