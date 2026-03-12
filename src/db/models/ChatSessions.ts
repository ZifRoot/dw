import { ChatSessionFull } from "../resp";
import { ChatSessionsCreate } from "./ChatSessionsCreate";

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

  constructor(data: ChatSessionsCreate) {
    this.id = data.id;
    this.title = data.title;
    this.title_type = data.title_type;
    this.pinned = data.pinned ?? false;
    this.updated_at = new Date(data.updated_at * 1000);

    // Поля из Full (TS поймет тип внутри блока if)
    if (isFull(data)) {
      if (data.seq_id != null) this.seq_id = data.seq_id;
      if (data.agent != null) this.agent = data.agent;
      if (data.version != null) this.version = data.version;
      if (data.current_message_id != null) this.current_message_id = data.current_message_id;
      if (data.inserted_at != null) this.inserted_at = new Date(data.inserted_at * 1000);
    }
  }
}

const nameof = <T>(name: keyof T) => name;

function isFull(data: ChatSessionsCreate): data is ChatSessionFull {
  // Список ключей, которые есть только в Full версии
  const fullKeys: (keyof ChatSessionFull)[] = ["version"];

  // Проверяем, что ВСЕ эти ключи присутствуют в объекте
  return fullKeys.every((key) => key in data);
}
