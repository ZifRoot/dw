// src/models/item.model.ts
import { formatDate, bufferToUUID, uuidToBuffer } from "../../utils/data-utils";

export interface Ichat_sessions {
  id?: Uint8Array | Buffer | string;
  title: string;
  title_type: string;
  pinned?: boolean;
  updated_at?: Date | number;
}

export class chat_sessions {
  public id?: Uint8Array<ArrayBuffer>;
  public title: string;
  public title_type: string;
  public pinned: boolean;
  public updated_at?: string|Date;

  constructor(data: Ichat_sessions) {
    // --- Обработка id ---
    if (typeof data.id === "string") {
      // Строковый UUID -> преобразуем в 16-байтовый буфер
      const buf = uuidToBuffer(data.id);
      this.id = buf; // уже Uint8Array<ArrayBuffer>
    } else if (data.id instanceof Uint8Array || (data.id as any) instanceof Buffer) {
      // Создаём новый 16-байтовый буфер (изначально заполнен нулями)
      const newId = new Uint8Array(16);
      // Копируем не более 16 байт из исходного буфера
      const source = data.id as Uint8Array;
      const len = Math.min(source.length, 16);
      newId.set(source.subarray(0, len));
      // Если исходный буфер короче 16, оставшиеся байты остаются нулями
      this.id = newId; // newId имеет тип Uint8Array<ArrayBuffer>
    } else {
      this.id = undefined! as Uint8Array<ArrayBuffer>;
    }

    // --- Остальные поля ---
    this.title = data.title;
    this.title_type = data.title_type;
    this.pinned = data.pinned ?? false;
    this.updated_at = data.updated_at == null ? undefined : new Date(data.updated_at);
  }

  // При сериализации в JSON автоматически преобразуем дату в нужные форматы
  toJSON() {
    return {
      id: bufferToUUID(this.id),
      title: this.title,
      title_type: this.title_type,
      pinned: this.pinned,
      updated_at: formatDate(new Date(Date.now())), // { timestamp, isoString, formatted }
    };
  }
}
