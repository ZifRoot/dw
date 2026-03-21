import { normalizeUUID, toDate } from "../../utils/data-utils";
import { MessageFileCreate } from "./MessageFileCreate";

export class MessageFile {
  public id: string;
  public status: string;
  public sessionId: string;
  public messageId: number;
  public file_name: string;
  public previewable: boolean;
  public file_size: number;
  public token_usage: number;
  public error_code: number | null;
  public inserted_at: Date;
  public updated_at: Date;
  public content: string | null;

  constructor(data: MessageFileCreate) {
    this.id = normalizeUUID(data.id) ?? crypto.randomUUID();
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.status = data.status;
    this.file_name = data.file_name;
    this.previewable = data.previewable;
    this.file_size = data.file_size;

    this.token_usage = data.token_usage;
    this.error_code = data.error_code ?? null;
    this.inserted_at = toDate(data.inserted_at)!;
    this.updated_at = toDate(data.updated_at)!;
    this.content = data.content ?? null;
  }
}
