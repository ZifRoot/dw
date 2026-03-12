import { normalizeUUID, toDate } from "../../utils/data-utils";
import { MessageFileCreate } from "./MessageFileCreate";

export class MessageFile {
  public id: string;
  public status: string;
  public sessionId: string;
  public messageId: number;
  public fileName: string;
  public previewable: boolean;
  public fileSize: number;
  public tokenUsage: number;
  public errorCode: number | null;
  public insertedAt: Date;
  public updatedAt: Date;

  constructor(data: MessageFileCreate) {
    this.id = normalizeUUID(data.id) ?? crypto.randomUUID();
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.status = data.status;
    this.fileName = data.file_name;
    this.previewable = data.previewable;
    this.fileSize = data.file_size;

    this.tokenUsage = data.token_usage;
    this.errorCode = data.error_code ?? null;
    this.insertedAt = toDate(data.inserted_at)!;
    this.updatedAt = toDate(data.updated_at)!;
  }
}
