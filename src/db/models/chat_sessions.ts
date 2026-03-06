// src/models/item.model.ts
import { formatDate, bufferToUUID, uuidToBuffer } from "../../utils/data-utils";

export interface Ichat_sessions {
  id?: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: Date | number | string;
}

export class chat_sessions {
  public id?: string;
  public title: string;
  public title_type: string;
  public pinned: boolean;
  public updated_at: string | Date;

  constructor(data: Ichat_sessions) {
    this.id = data.id;
    this.title = data.title;
    this.title_type = data.title_type;
    this.pinned = data.pinned ?? false;
    this.updated_at = new Date(data.updated_at);
  }

  // При сериализации в JSON автоматически преобразуем дату в нужные форматы
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      title_type: this.title_type,
      pinned: this.pinned,
      updated_at: formatDate(new Date(Date.now())), // { timestamp, isoString, formatted }
    };
  }
}
