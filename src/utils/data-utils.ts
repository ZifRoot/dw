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
