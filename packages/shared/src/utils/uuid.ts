/**
 * Преобразует массив байт в каноническую строку UUID (формат 8-4-4-4-12).
 * Работает как в Node.js, так и в браузере — не зависит от `Buffer`.
 *
 * @param buffer - Массив байт (обычно 16 байт). Если `undefined` или пустой — возвращает пустую строку.
 * @returns UUID-строка в формате `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` либо `""`, если буфер пуст.
 *
 * @example
 * bufferToUUID(new Uint8Array([0xad, 0xc1, 0xdb, 0xf5, 0x82, 0xf0, 0x45, 0x35,
 *                              0x80, 0x6e, 0xda, 0x9c, 0x6a, 0x1a, 0xf3, 0x98]));
 * // "adc1dbf5-82f0-4535-806e-da9c6a1af398"
 */
export function bufferToUUID(buffer?: Uint8Array<ArrayBuffer>): string {
  if (buffer == null || buffer.length === 0) return "";

  let hex = "";
  for (let i = 0; i < buffer.length; i++) {
    hex += buffer[i].toString(16).padStart(2, "0");
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Преобразует строку UUID в массив байт.
 * Работает как в Node.js, так и в браузере — не зависит от `Buffer`.
 *
 * @param uuid - Строка UUID. Дефисы необязательны.
 * @returns `Uint8Array` с байтами, полученными из hex-представления.
 * @throws {Error} Если строка содержит не-hex символы или имеет нечётную длину.
 *
 * @example
 * uuidToBuffer("adc1dbf5-82f0-4535-806e-da9c6a1af398");
 * // Uint8Array(16) [173, 193, 219, 245, ...]
 */
export function uuidToBuffer(uuid: string): Uint8Array<ArrayBuffer> {
  const hex = uuid.replace(/-/g, "");

  if (hex.length % 2 !== 0) {
    throw new Error("Invalid UUID: hex string must have an even length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid UUID: contains non-hex characters");
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Извлекает и нормализует UUID из строки.
 *
 * Принимает как «голый» UUID, так и строку с префиксом `file-`,
 * а также hex-строку без дефисов. Регистр символов не важен.
 *
 * @param input - Входная строка (например, `"file-adc1dbf5-82f0-4535-806e-da9c6a1af398"`
 *                или `"adc1dbf582f04535806eda9c6a1af398"`).
 * @returns Нормализованный UUID в нижнем регистре с дефисами
 *          либо `null`, если строка не содержит валидного UUID.
 *
 * @example
 * normalizeUUID("file-adc1dbf5-82f0-4535-806e-da9c6a1af398");
 * // "adc1dbf5-82f0-4535-806e-da9c6a1af398"
 *
 * normalizeUUID("ADC1DBF582F04535806EDA9C6A1AF398");
 * // "adc1dbf5-82f0-4535-806e-da9c6a1af398"
 *
 * normalizeUUID("not-a-uuid");
 * // null
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
