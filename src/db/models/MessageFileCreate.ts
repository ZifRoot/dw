import { ChatMessageFile } from "../resp";

export type MessageFileCreate = Omit<ChatMessageFile, "inserted_at" | "updated_at"> & {
  inserted_at: number | Date | null;
  updated_at: number | Date | null;
  sessionId: string;
  messageId: number;
  content?: Blob | null | undefined;
};
