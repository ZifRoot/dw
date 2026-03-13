import { toDate } from "../../utils/data-utils";
import { ChatSessionsCreate, FullWithDates } from "./ChatSessionsCreate";

/**
 * Класс модели сессии.
 * Приводит переданные данные к единому формату (Date объекты).
 */
export class ChatSessions {
  public id: string;
  public title: string;
  public title_type: string;
  public pinned: boolean;
  public updated_at: Date;

  // Поля полной версии
  public seq_id?: number;
  public agent?: string;
  public version?: number;
  public current_message_id?: number;
  public inserted_at?: Date;
  public user_id: string | null;

  constructor(data: ChatSessionsCreate) {
    this.id = data.id;
    this.title = data.title;
    this.title_type = data.title_type;
    this.pinned = data.pinned ?? false;
    this.updated_at = toDate(data.updated_at)!;
    this.user_id = data.user_id;

    // Поля из Full (проверяем наличие полей полной версии)
    if (isFull(data)) {
      // data теперь рассматривается как FullWithDates
      if (data.seq_id != null) this.seq_id = data.seq_id;
      if (data.agent != null) this.agent = data.agent;
      if (data.version != null) this.version = data.version;
      if (data.current_message_id != null) this.current_message_id = data.current_message_id;
      if (data.inserted_at != null) this.inserted_at = toDate(data.inserted_at)!;
    }
  }
}

/**
 * Проверяет, содержит ли объект поля полной версии сессии.
 * Возвращает true, если объект соответствует типу FullWithDates.
 */
function isFull(data: ChatSessionsCreate): data is FullWithDates {
  // Ключи, которые присутствуют только в полной версии
  const fullKeys: (keyof FullWithDates)[] = ["version"];
  return fullKeys.every((key) => key in data);
}
