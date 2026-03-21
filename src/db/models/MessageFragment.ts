import { MessageFragmentCreate } from "./MessageFragmentCreate";

export class MessageFragment {
  public sessionId: string;
  public messageId: number;
  public fragmentOrder: number;
  public type: string;
  public content: string;
  public elapsed_secs: number | null;
  public references: unknown | null;
  public stage_id: number | null;
  public size: number;

  constructor(data: MessageFragmentCreate) {
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.fragmentOrder = data.id;
    this.type = data.type;
    this.content = data.content ?? "";
    this.elapsed_secs = data.elapsed_secs ?? null;
    this.references = data.references ?? null;
    this.stage_id = data.stage_id ?? null;
    this.size = data.size ?? data.content?.length ?? 0;
  }
}
