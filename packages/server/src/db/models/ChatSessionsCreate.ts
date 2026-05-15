import { ChatSessionBase, ChatSessionFull } from "../resp";

/**
 * Интерфейс для создания/обновления сессии.
 * Все поля, кроме id, обязательны для базовой сессии.
 * Дополнительные поля используются в полной версии сессии (например, при загрузке сообщений).
 */
export type BaseWithDates = Omit<ChatSessionBase, "updated_at"> & {
  updated_at: number | Date | null;
  user_id: string | null;
};

export type FullWithDates = Omit<ChatSessionFull, "updated_at" | "inserted_at"> & {
  updated_at: number | Date | null;
  inserted_at: number | Date | null;
  user_id: string | null;
};

export type ChatSessionsCreate = FullWithDates | BaseWithDates;
