// 1. Расширяем глобальный интерфейс Array
declare global {
  interface Array<T> {
    /**
     * Возвращает новый массив, содержащий только уникальные элементы
     * @param keySelector - поле или функция, возвращающая ключ для сравнения
     * @param strategy - 'first' (первое вхождение) или 'last' (последнее вхождение)
     */
    uniqueBy<K extends keyof T | ((item: T) => PropertyKey)>(keySelector: K, strategy?: "first" | "last"): T[];
  }
}

// 2. Реализация метода
Array.prototype.uniqueBy = function <T, K extends keyof T | ((item: T) => PropertyKey)>(
  this: T[],
  keySelector: K,
  strategy: "first" | "last" = "first",
): T[] {
  // Функция для извлечения ключа
  const getKey = (item: T): PropertyKey =>
    typeof keySelector === "function" ? (keySelector as (item: T) => PropertyKey)(item) : (item[keySelector as keyof T] as unknown as PropertyKey);

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

// Определяем тип с обязательным полем id
type WithId = { id: string | number };

// Универсальная функция для удаления дубликатов по id
export const uniqueById = <T extends WithId>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()];

export const uniqueBy = <T, K extends keyof T | ((item: T) => string | number)>(items: T[], keySelector: K): T[] => [
  ...new Map(
    items.map((item) => [typeof keySelector === "function" ? (keySelector as (item: T) => any)(item) : item[keySelector as keyof T], item]),
  ).values(),
];
