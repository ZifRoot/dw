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
