import { MessageFragmentCreate } from "./MessageFragmentCreate";

export class MessageFragment {
  public sessionId: string;
  public messageId: number;
  public fragmentOrder: number;
  public type: string;
  public content: string;
  public elapsedSecs: number | null;
  public references: unknown | null;
  public stageId: number | null;

  constructor(data: MessageFragmentCreate) {
    this.sessionId = data.sessionId;
    this.messageId = data.messageId;
    this.fragmentOrder = data.id;
    this.type = data.type;
    this.content = data.content ?? "";
    this.elapsedSecs = data.elapsed_secs ?? null;
    this.references = data.references ?? null;
    this.stageId = data.stage_id ?? null;
  }
}
