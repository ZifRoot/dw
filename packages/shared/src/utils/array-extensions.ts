// 1. Расширяем глобальный интерфейс Array
declare global {
  interface Array<T> {
    /**
     * Возвращает новый массив, содержащий только уникальные элементы
     * @param keySelector - поле или функция, возвращающая ключ для сравнения
     * @param strategy - 'first' (первое вхождение) или 'last' (последнее вхождение)
     */
    uniqueBy<K extends keyof T | ((item: T) => PropertyKey)>(keySelector: K, strategy?: "first" | "last"): T[];
    groupBy<K>(keySelector: (item: T) => K): Map<K, T[]>;
    groupBy<K, Y>(keySelector: (item: T) => K, em: (items: T[]) => Y): Map<K, Y>;
    removeByIndices(indices: number[], del: (p: T) => void, add: (p: T, index: number) => void): void;
    shuffle(): T[];
  }
}

// 2. Реализация метода
Array.prototype.uniqueBy = function <T, K extends keyof T | ((item: T) => PropertyKey)>(
  this: T[],
  keySelector: K,
  strategy: "first" | "last" = "first",
): T[] {
  // Функция для извлечения ключа

  const getKey =
    typeof keySelector === "function"
      ? (keySelector as (item: T) => PropertyKey)
      : typeof keySelector === "string"
        ? (item: T) => item[keySelector as keyof T] as unknown as PropertyKey
        : null;

  if (!getKey) return this;

  const map = new Map<PropertyKey, T>();

  if (strategy === "last") {
    // Просто заполняем Map — последний встреченный перезапишет предыдущий
    for (const item of this) {
      map.set(getKey(item), item);
    }
  } else {
    // Сохраняем только первый встреченный элемент для каждого ключа
    for (const item of this) {
      const key = getKey(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
  }

  return Array.from(map.values());
};

Array.prototype.groupBy = function <T, K, Y>(this: T[], keySelector: (item: T) => K, em?: (items: T[]) => Y): Map<K, Y> {
  if (em) {
    return groupToMapEm(this, keySelector, em);
  }

  return groupToMap(this, keySelector) as Map<K, Y>;
};

// Array.prototype.groupBy = function <T, K>(this: T[], getKey: (item: T) => K): Map<K, T[]> {
//   return groupToMap(this, getKey);
// };

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

// Определяем тип с обязательным полем id
type WithId = { id: string | number };

// Универсальная функция для удаления дубликатов по id
export const uniqueById = <T extends WithId>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()];

export const uniqueBy = <T, K extends keyof T | ((item: T) => string | number)>(items: T[], keySelector: K): T[] => [
  ...new Map(
    items.map((item) => [typeof keySelector === "function" ? (keySelector as (item: T) => any)(item) : item[keySelector as keyof T], item]),
  ).values(),
];

export function removeByIndices<T>(this: T[], indices: number[], del: (p: T) => void, add: (p: T, index: number) => void): void {
  if (indices.length === 0) return;
  // Уникальные индексы, отсортированные по убыванию
  const toDelete = indices.filter((i) => i != null && i >= 0 && i < this.length).sort((a, b) => b - a);
  let prev = -1;
  for (const idx of toDelete) {
    if (idx === prev) continue;
    prev = idx;
    if (idx >= this.length) continue;
    const removedObj = this[idx];
    del(removedObj);
    if (idx === this.length - 1) {
      this.pop();
    } else {
      add((this[idx] = this.pop()!), idx);
    }
  }
}
export function shuffle<T>(this: T[]): T[] {
  const result = [...this];
  for (let i = 0; i < result.length; i++) {
    const j = Math.floor(Math.random() * result.length);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
Array.prototype.removeByIndices = removeByIndices;
Array.prototype.shuffle = shuffle;
