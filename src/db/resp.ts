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
  seq_id: number | null;
  agent: string | null;
  version: number | null;
  current_message_id: number | null;
  inserted_at: number | null; // timestamp создания
}

// Для обратной совместимости: краткая версия остаётся основным ChatSession
export type ChatSession = ChatSessionBase;

// ========================
// Типы для файлов сообщений (новые)
// ========================

export type ChatMessageFileStatus = "SUCCESS" | "PENDING" | "ERROR" | string;

export interface ChatMessageFile {
  id: string; // UUID
  status: ChatMessageFileStatus;
  file_name: string;
  previewable: boolean;
  file_size: number; // в байтах
  token_usage: number; // использовано токенов
  error_code: number | null; // код ошибки, если статус ERROR
  inserted_at: number; // timestamp создания
  updated_at: number; // timestamp обновления
}

// ========================
// Типы для сообщений (обновлённые)
// ========================

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
  files: ChatMessageFile[]; // теперь типизировано
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
  elapsed_secs?: number | null; // для type "THINK"
  references?: any; // для "THINK" и "RESPONSE"
  stage_id?: number | null; // для "THINK" и "RESPONSE"
}

export type FragmentType = "REQUEST" | "THINK" | "RESPONSE";

// ========================
// Ответы API
// ========================

export type SessionsBizData = {
  chat_sessions: ChatSession[];
  has_more: boolean;
};

export type MessagesBizData = {
  chat_session: ChatSessionFull;
  chat_messages: ChatMessage[];
};

export type SessionsResponse = ApiResponse<SessionsBizData>;
export type MessagesResponse = ApiResponse<MessagesBizData>;
