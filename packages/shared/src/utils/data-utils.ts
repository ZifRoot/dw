export function delay(ms: number) {
  if (ms <= 0) return;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safe<T>(fn: () => Promise<T>, _default?: T) {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
    return _default;
  }
}

export function safeSync<T>(fn: () => T, _default?: T) {
  try {
    return fn();
  } catch (error) {
    console.error(error);
    return _default;
  }
}

export function subtractSets<T>(A: T[], B: T[]) {
  let setB = new Set([...B]);
  return [...new Set([...A].filter((x) => !setB.has(x)))];
}

export function removeByIndices<T>(arr: T[], indices: number[], del: (p: T) => void, add: (index: number, p: T) => void): void {
  // Уникальные индексы, отсортированные по убыванию
  const toDelete = indices.filter((i) => i >= 0 && i < arr.length).sort((a, b) => b - a);
  let prev = -1;
  for (const idx of toDelete) {
    if (idx === prev) continue;
    prev = idx;
    if (idx >= arr.length) continue;
    const removedObj = arr[idx];
    del(removedObj);
    if (idx === arr.length - 1) {
      arr.pop();
    } else {
      add(idx, (arr[idx] = arr.pop()!));
    }
  }
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
