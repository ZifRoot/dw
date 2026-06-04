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
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    if (value < 0) return null;
    const asSeconds = new Date(value * 1000);
    const currentYearPlus5 = new Date().getFullYear() + 5;
    const date = asSeconds.getFullYear() <= currentYearPlus5 ? asSeconds : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    return parseStringToDate(value);
  }
  return null;
}

function parseStringToDate(str: string): Date | null {
  // 1. ISO 8601 (пробуем стандартный парсер, но только если строка похожа на ISO)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (isoRegex.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) return date;
  }

  // 2. YYYY-MM-DD
  const dateOnlyRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const matchDateOnly = str.match(dateOnlyRegex);
  if (matchDateOnly) {
    const [, year, month, day] = matchDateOnly;
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    if (!isNaN(date.getTime())) return date;
  }

  // 3. YYYY-MM-DD HH:MM:SS (или HH:MM:SS.sss)
  const datetimeRegex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
  const matchDatetime = str.match(datetimeRegex);
  if (matchDatetime) {
    const [, year, month, day, hour, minute, second, msPart] = matchDatetime;
    let ms = 0;
    if (msPart) ms = parseInt(msPart.padEnd(3, "0").slice(0, 3), 10);
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, ms));
    if (!isNaN(date.getTime())) return date;
  }

  // 4. MM/DD/YYYY (американский)
  const usRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const matchUs = str.match(usRegex);
  if (matchUs) {
    const [, month, day, year] = matchUs;
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    if (!isNaN(date.getTime())) return date;
  }

  // 5. Строковый timestamp (только цифры)
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      return toDate(+num);
    }
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
