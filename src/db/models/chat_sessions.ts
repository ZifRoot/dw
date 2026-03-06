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

// ========================
// Базовые типы (существующие, оставляем без изменений)
// ========================

export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: Data<T>;
  cache_control?: string; // например "MERGE"
}

export interface Data<T> {
  biz_code: number;
  biz_msg: string;
  biz_data: T;
}

// ========================
// Типы для сессий (два варианта: краткий и полный)
// ========================

export type TitleType = "SYSTEM" | "USER" | "WIP" | string;

/**
 * Базовая информация о сессии, используемая в списках
 */
export interface ChatSessionBase {
  id: string;
  title: string;
  title_type: TitleType;
  pinned: boolean;
  updated_at: number; // timestamp в секундах, может быть дробным
}

/**
 * Полная информация о сессии, возвращаемая при загрузке сообщений
 */
export interface ChatSessionFull extends ChatSessionBase {
  seq_id: number;
  agent: string;
  version: number;
  current_message_id: number;
  inserted_at: number; // timestamp создания
}

// Для обратной совместимости: краткая версия остаётся основным ChatSession
export type ChatSession = ChatSessionBase;

// ========================
// Типы для ответов API
// ========================

/**
 * Ответ со списком сессий (использует краткую версию)
 */
export type SessionsBizData = {
  chat_sessions: ChatSession[]; // краткие сессии
  has_more: boolean;
};

export type SessionsResponse = ApiResponse<SessionsBizData>;

/**
 * Ответ с сообщениями конкретной сессии (использует полную версию)
 */
export interface ChatMessage {
  message_id: number;
  parent_id: number | null;
  model: string;
  role: Role;
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  status: MessageStatus;
  accumulated_token_usage: number;
  files: unknown[];
  feedback: unknown | null;
  inserted_at: number;
  search_enabled: boolean;
  fragments: Fragment[];
  has_pending_fragment: boolean;
  auto_continue: boolean;
}

export type Role = "USER" | "ASSISTANT";
export type MessageStatus = "FINISHED" | string;

export interface Fragment {
  id: number;
  type: FragmentType;
  content: string;
  elapsed_secs?: number; // для type "THINK"
  references?: unknown[]; // для "THINK" и "RESPONSE"
  stage_id?: number; // для "THINK" и "RESPONSE"
}

export type FragmentType = "REQUEST" | "THINK" | "RESPONSE";

export type MessagesBizData = {
  chat_session: ChatSessionFull; // здесь полная сессия
  chat_messages: ChatMessage[];
};

export type MessagesResponse = ApiResponse<MessagesBizData>;
