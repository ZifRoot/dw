import { ChatMessage } from "../resp";

export type ChatMessageCreate = ChatMessage & { sessionId: string };