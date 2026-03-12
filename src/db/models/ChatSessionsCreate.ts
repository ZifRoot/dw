// models/chatSessions.ts

import { ChatSessionBase, ChatSessionFull } from "../resp";

/**
 * Интерфейс для создания/обновления сессии.
 * Все поля, кроме id, обязательны для базовой сессии.
 * Дополнительные поля используются в полной версии сессии (например, при загрузке сообщений).
 */
type BaseWithDates = Omit<ChatSessionBase, "updated_at"> & { updated_at: number | Date | null };

type FullWithDates = Omit<ChatSessionFull, "updated_at" | "inserted_at"> & { updated_at: number | Date | null; inserted_at: number | Date | null };

export type ChatSessionsCreate = FullWithDates | BaseWithDates;
