import { ChatMessageFile } from "../resp";

export type MessageFileCreate = ChatMessageFile & { sessionId: string; messageId: number; };
