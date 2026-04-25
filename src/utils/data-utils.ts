export interface DateFormats {
  timestamp: number; // Unix timestamp в секундах (как в примере: 1772730278.516)
  isoString: string; // Строка ISO 8601
  formatted: string; // Локальное представление (по желанию)
}

/**
 * Преобразует объект Date в нужные форматы.
 * updated_at из Prisma возвращается как объект Date.
 */
export function formatDate(date?: Date): DateFormats {
  if (date == null)
    return {
      timestamp: 0, // в секундах с дробной частью
      isoString: "",
      formatted: "",
    };
  return {
    timestamp: date.getTime() / 1000, // в секундах с дробной частью
    isoString: date.toISOString(),
    formatted: date.toLocaleString("ru-RU"),
  };
}

// Если нужно расширить модель, можно создать класс-обёртку
export class ItemWithFormattedDate {
  id: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: DateFormats;

  constructor(item: any) {
    this.id = item.id;
    this.title = item.title;
    this.title_type = item.title_type;
    this.pinned = item.pinned;
    this.updated_at = formatDate(item.updated_at);
  }
}

export function bufferToUUID(buffer?: Uint8Array<ArrayBuffer>): string {
  if (buffer == null) return "";
  const hex = (buffer as Buffer).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidToBuffer(uuid: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(uuid.replace(/-/g, ""), "hex"));
}

/**
 * Извлекает и нормализует UUID из строки.
 * @param {string} input - Входная строка (например, "file-adc1dbf5-82f0-4535-806e-da9c6a1af398" или "adc1dbf582f04535806eda9c6a1af398")
 * @returns {string|null} - Нормализованный UUID или null, если строка не содержит валидного UUID.
 */
export function normalizeUUID(input?: string): string | null {
  if (typeof input !== "string") return null;

  // Удаляем префикс "file-", если он есть
  let candidate = input;
  if (input.startsWith("file-")) {
    candidate = input.substring(5);
  }

  // Удаляем все дефисы и приводим к нижнему регистру для проверки
  const cleaned = candidate.replace(/-/g, "").toLowerCase();

  // Проверяем, что получилось 32 шестнадцатеричных символа
  const hexRegex = /^[0-9a-f]{32}$/;
  if (!hexRegex.test(cleaned)) {
    return null;
  }

  // Форматируем с дефисами: 8-4-4-4-12
  const parts = [cleaned.substring(0, 8), cleaned.substring(8, 12), cleaned.substring(12, 16), cleaned.substring(16, 20), cleaned.substring(20, 32)];

  return parts.join("-");
}

export function toDate(value: number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(value * 1000);
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

export function dateStr(value: Date | number | null | undefined): string {
  return toDate(value)?.toLocaleString("ru-RU", format) ?? "";
}

export const format: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

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

export function getHighResTime() {
  const now = new Date();
  // Получаем дробную часть текущей миллисекунды
  const micro = (performance.now() % 1).toFixed(3).substring(2);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");

  return `${hh}:${mm}:${ss}.${ms}${micro}`;
}

console.log(getHighResTime()); // "18:35:48.50612"
