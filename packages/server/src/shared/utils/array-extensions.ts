/**
 * Возвращает генератор-функцию, которая при каждом вызове
 * возвращает случайный элемент массива.
 *
 * @param array Массив, из которого выбираются элементы.
 * @returns Генератор случайных элементов массива.
 * @throws {Error} Если массив пустой.
 */
export function randomElementGenerator<T>(array: readonly T[]): () => T {
  if (array.length === 0) {
    throw new Error("Cannot create random element generator for an empty array");
  }

  return () => array[Math.floor(Math.random() * array.length)];
}
