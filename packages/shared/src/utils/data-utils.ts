export function delay(ms: number) {
  if (ms <= 0) return;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
  }
}

export function subtractSets<T>(A: T[], B: T[]) {
  let setB = new Set([...B]);
  return [...new Set([...A].filter((x) => !setB.has(x)))];
}

export function removeByIndices<T>(arr: T[], indices: number[]): void {
  // Уникальные индексы, отсортированные по убыванию
  const toDelete = [...new Set(indices)].filter((i) => i >= 0 && i < arr.length).sort((a, b) => b - a);

  for (const idx of toDelete) {
    if (idx >= arr.length) continue;
    if (idx === arr.length - 1) {
      arr.pop();
    } else {
      arr[idx] = arr.pop() as T; // заменяем и удаляем последний
    }
  }
}
