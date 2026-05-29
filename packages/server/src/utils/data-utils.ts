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

export function groupToMap<T, K>(array: T[], getKey: (item: T) => K): Map<K, T[]> {
  return array.reduce((map, item) => {
    const key = getKey(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
    return map;
  }, new Map<K, T[]>());
}

export function groupToMapEm<T, K, Y>(array: T[], getKey: (item: T) => K, em: (items: T[]) => Y): Map<K, Y> {
  let m = array.reduce((map, item) => {
    const key = getKey(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
    return map;
  }, new Map<K, T[]>());
  let ents = m.entries();

  let map = new Map<K, Y>();
  for (const ent of ents) {
    map.set(ent[0], em(ent[1]));
  }
  return map;
}
