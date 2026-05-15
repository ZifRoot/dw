import { ChatMessage } from "../resp";

export type ChatMessageCreate = Omit<ChatMessage, 'inserted_at'> & 
  { inserted_at: number | Date | null } & 
  { sessionId: string };