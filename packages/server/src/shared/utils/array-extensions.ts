/**
 * Возвращает генератор, который при каждом вызове next()
 * возвращает случайный элемент массива.
 *
 * @param array Массив, из которого выбираются элементы.
 * @returns Генератор случайных элементов массива.
 * @throws {Error} Если массив пустой.
 */
export function* randomElementGenerator<T>(array: readonly T[]): Generator<T> {
  if (array.length === 0) {
    throw new Error("Cannot create random element generator for an empty array");
  }

  while (true) {
    yield array[Math.floor(Math.random() * array.length)];
  }
}
