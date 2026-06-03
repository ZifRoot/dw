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

export function toDate(value: number | Date | null | string | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    if (value < 0) return null;
    let date = new Date(value * 1000);
    return date.getFullYear() > new Date().getFullYear() + 5 ? new Date(value) : date;
  }
  if (typeof value === "string") {
    let date = new Date(value);
    // Если строка пустая или невалидная – сразу возвращаем null
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }
  return null;
}

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
