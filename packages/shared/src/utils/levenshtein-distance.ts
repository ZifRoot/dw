/**
 * Вычисляет редакционное расстояние (расстояние Левенштейна)
 * между двумя строками.
 *
 * Расстояние — минимальное количество операций вставки,
 * удаления или замены символа, необходимых для преобразования
 * одной строки в другую.
 *
 * @param source Исходная строка.
 * @param target Целевая строка.
 * @returns Минимальное количество редакционных операций.
 */
export function levenshteinDistance(source: string, target: string): number {
  if (source === target) {
    return 0;
  }

  if (source.length === 0) {
    return target.length;
  }

  if (target.length === 0) {
    return source.length;
  }

  // Храним только две строки матрицы расстояний,
  // поэтому дополнительная память составляет O(min(n, m)).
  if (source.length > target.length) {
    return levenshteinDistance(target, source);
  }

  let previous = new Array<number>(source.length + 1);
  let current = new Array<number>(source.length + 1);

  for (let i = 0; i <= source.length; i++) {
    previous[i] = i;
  }

  for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
    current[0] = targetIndex;

    for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
      const substitutionCost =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;

      current[sourceIndex] = Math.min(
        current[sourceIndex - 1] + 1,
        previous[sourceIndex] + 1,
        previous[sourceIndex - 1] + substitutionCost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[source.length];
}
