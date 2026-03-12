// models/chatSessions.ts

import { ChatSessionBase, ChatSessionFull } from "../resp";

/**
 * Интерфейс для создания/обновления сессии.
 * Все поля, кроме id, обязательны для базовой сессии.
 * Дополнительные поля используются в полной версии сессии (например, при загрузке сообщений).
 */
export type ChatSessionsCreate = ChatSessionFull | ChatSessionBase;
