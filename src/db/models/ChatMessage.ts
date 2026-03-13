import { toDate } from "../../utils/data-utils";
import { ChatMessageCreate } from "./ChatMessageCreate";

export class ChatMessage {
  public sessionId: string;
  public messageId: number;
  public parentMessageId: number | null;
  public model: string | null;
  public role: string;
  public thinkingEnabled: boolean;
  public banEdit: boolean;
  public banRegenerate: boolean;
  public status: string;
  public accumulatedTokenUsage: number;
  public feedback: unknown | null;
  public insertedAt: Date;
  public searchEnabled: boolean;
  public hasPendingFragment: boolean;
  public autoContinue: boolean;

  constructor(data: ChatMessageCreate ) {
    this.sessionId = data.sessionId;
    this.messageId = data.message_id;
    this.parentMessageId = data.parent_id ?? null;
    this.model = data.model ?? null;
    this.role = data.role;
    this.thinkingEnabled = data.thinking_enabled;
    this.banEdit = data.ban_edit;
    this.banRegenerate = data.ban_regenerate;
    this.status = data.status;
    this.accumulatedTokenUsage = data.accumulated_token_usage;
    this.feedback = data.feedback ?? null;
    this.insertedAt = toDate(data.inserted_at)!;
    this.searchEnabled = data.search_enabled;
    this.hasPendingFragment = data.has_pending_fragment;
    this.autoContinue = data.auto_continue;
  }
}
