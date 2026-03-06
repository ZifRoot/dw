// src/models/item.model.ts
import { formatDate } from "../../utils/data-utils";

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
  public updated_at: Date;

  constructor(data: Ichat_sessions) {
    this.id = data.id;
    this.title = data.title;
    this.title_type = data.title_type;
    this.pinned = data.pinned ?? false;
    if (typeof data.updated_at == "number") {
      this.updated_at = new Date(data.updated_at * 1000);
    } else {
      this.updated_at = new Date(data.updated_at);
    }

    // this.updated_at = this.updated_at.toISOString();
    // this.updated_at = this.updated_at.valueOf()/1000;
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

export interface ApiResponse {
  code: number;
  msg: string;
  data: Data;
}

export interface Data {
  biz_code: number;
  biz_msg: string;
  biz_data: BizData;
}

export interface BizData {
  chat_sessions: ChatSession[];
  has_more: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  title_type: "SYSTEM" | "USER"; // Либо string, если типы могут меняться
  pinned: boolean;
  updated_at: number;
}
