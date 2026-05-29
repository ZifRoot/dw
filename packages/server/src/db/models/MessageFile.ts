import { toDate } from "@utils/date-utils";
import { MessageFileCreate } from "./MessageFileCreate";
import { normalizeUUID } from "@utils/uuid";

export class MessageFile {
  public id: string;
  public status: string;
  public sessionId: string;
  public messageId: number;
  public file_name: string;
  public previewable: boolean;
  public file_size: number;
  public token_usage: number;
  public error_code: number | null;
  public inserted_at: Date;
  public updated_at: Date;
  public content: string | null;
  public contentBytes: Buffer<ArrayBuffer> | null;

  constructor(data: MessageFileCreate) {
    this.id = normalizeUUID(data.id) ?? crypto.randomUUID();
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.status = data.status;
    this.file_name = data.file_name;
    this.previewable = data.previewable;
    this.file_size = data.file_size;

    this.token_usage = data.token_usage;
    this.error_code = data.error_code ?? null;
    this.inserted_at = toDate(data.inserted_at)!;
    this.updated_at = toDate(data.updated_at)!;

    // Обработка null или undefined
    if (data.content == null) {
      this.content = null;
      this.contentBytes = null;
      return;
    }

    // Если это строка
    if (typeof data.content === "string") {
      // Убираем префикс '0x', если он есть
      const hex = data.content.startsWith("0x") ? data.content.slice(2) : data.content;
      // Создаём Buffer из hex-строки
      const buffer = Buffer.from(hex, "hex");
      this.content = hex;
      this.contentBytes = buffer;
      return;
    }

    // Если это Buffer (проверяем через isBuffer)
    if (Buffer.isBuffer(data.content)) {
      const hex = data.content.toString("hex");
      this.content = hex;
      this.contentBytes = data.content;
      return;
    }
    if (data.content instanceof ArrayBuffer) {
      const buffer = Buffer.from(data.content);
      this.content = buffer.toString("hex");
      this.contentBytes = buffer;
      return;
    }

    // Запасной вариант (по типам сюда не должны попасть)
    this.content = null;
    this.contentBytes = null;
  }
}
