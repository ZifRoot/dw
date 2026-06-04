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
