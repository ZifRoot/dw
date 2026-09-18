/**
 * Тип редакционной операции.
 */
export type LevenshteinEditType = 'insert' | 'delete' | 'replace';

/**
 * Описывает одну редакционную операцию над строкой.
 *
 * Индекс указывает позицию в строке непосредственно перед выполнением
 * этой операции. Для вставки и замены указывается новый символ,
 * для удаления — удаляемый символ.
 */
export interface LevenshteinEdit {
  /** Тип операции. */
  type: LevenshteinEditType;

  /** Позиция операции в текущей строке. */
  index: number;

  /** Символ, который добавляется или удаляется. */
  character: string;
}

/**
 * Вычисляет последовательность редакционных операций,
 * преобразующих одну строку в другую.
 *
 * Используются операции вставки, удаления и замены символа.
 * Количество возвращённых операций всегда равно расстоянию Левенштейна
 * между исходной и целевой строками.
 *
 * @param source Исходная строка.
 * @param target Целевая строка.
 * @returns Минимальная последовательность редакционных операций.
 */
export function levenshteinEdits(
  source: string,
  target: string,
): LevenshteinEdit[] {
  const sourceLength = source.length;
  const targetLength = target.length;

  const distances = Array.from(
    { length: sourceLength + 1 },
    () => new Array<number>(targetLength + 1),
  );

  for (let sourceIndex = 0; sourceIndex <= sourceLength; sourceIndex++) {
    distances[sourceIndex][0] = sourceIndex;
  }

  for (let targetIndex = 0; targetIndex <= targetLength; targetIndex++) {
    distances[0][targetIndex] = targetIndex;
  }

  for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex++) {
    for (let targetIndex = 1; targetIndex <= targetLength; targetIndex++) {
      const substitutionCost =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;

      distances[sourceIndex][targetIndex] = Math.min(
        distances[sourceIndex - 1][targetIndex] + 1,
        distances[sourceIndex][targetIndex - 1] + 1,
        distances[sourceIndex - 1][targetIndex - 1] + substitutionCost,
      );
    }
  }

  const edits: LevenshteinEdit[] = [];
  let sourceIndex = sourceLength;
  let targetIndex = targetLength;

  while (sourceIndex > 0 || targetIndex > 0) {
    if (
      sourceIndex > 0 &&
      targetIndex > 0 &&
      source[sourceIndex - 1] === target[targetIndex - 1] &&
      distances[sourceIndex][targetIndex] ===
        distances[sourceIndex - 1][targetIndex - 1]
    ) {
      sourceIndex--;
      targetIndex--;
      continue;
    }

    if (
      sourceIndex > 0 &&
      targetIndex > 0 &&
      distances[sourceIndex][targetIndex] ===
        distances[sourceIndex - 1][targetIndex - 1] + 1
    ) {
      edits.push({
        type: 'replace',
        index: sourceIndex - 1,
        character: target[targetIndex - 1],
      });
      sourceIndex--;
      targetIndex--;
      continue;
    }

    if (
      sourceIndex > 0 &&
      distances[sourceIndex][targetIndex] ===
        distances[sourceIndex - 1][targetIndex] + 1
    ) {
      edits.push({
        type: 'delete',
        index: sourceIndex - 1,
        character: source[sourceIndex - 1],
      });
      sourceIndex--;
      continue;
    }

    edits.push({
      type: 'insert',
      index: sourceIndex,
      character: target[targetIndex - 1],
    });
    targetIndex--;
  }

  edits.reverse();

  return edits;
}
