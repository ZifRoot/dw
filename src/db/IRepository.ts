// IItemRepository.ts
import { ChatSessionsCreate } from "./models/ChatSessionsCreate";
import { ChatSessions } from "./models/ChatSessions";

import { ChatMessage } from "./models/ChatMessage";
import { MessageFile } from "./models/MessageFile";
import { MessageFileCreate } from "./models/MessageFileCreate";
import { ChatMessageCreate } from "./models/ChatMessageCreate";
import { MessageFragment } from "./models/MessageFragment";
import { MessageFragmentCreate } from "./models/MessageFragmentCreate";

export interface IRepository {
  // ========== Chat Sessions ==========
  findAllSessions(): Promise<ChatSessions[]>;
  findSessionById(id: string): Promise<ChatSessions | null>;
  createSession(data: ChatSessionsCreate): Promise<ChatSessions>;
  createManySessions(data: ChatSessionsCreate[]): Promise<number>;

  // ========== Chat Messages ==========
  findAllMessages(sessionId: string): Promise<ChatMessage[]>;
  findMessageById(sessionId: string, messageId: number): Promise<ChatMessage | null>;
  createMessage(data: ChatMessageCreate): Promise<ChatMessage>;
  createManyMessages(sessionId: string, messages: ChatMessageCreate[]): Promise<number>;

  // ========== Files ==========
  findAllFiles(sessionId: string, messageId: number): Promise<MessageFile[]>;
  findFileById(id: string): Promise<MessageFile | null>;
  createFile(data: MessageFileCreate): Promise<MessageFile>;
  createManyFiles(data: MessageFileCreate[]): Promise<number>;

  // ========== Message Fragments ==========
  findAllFragments(sessionId: string, messageId: number): Promise<MessageFragment[]>;
  findFragmentById(sessionId: string, messageId: number, fragmentId: number): Promise<MessageFragment | null>;
  createFragment(data: MessageFragmentCreate): Promise<MessageFragment>;
  createManyFragments(data: MessageFragmentCreate[]): Promise<number>;

  // ========== Message-File Links ==========
  addFileToMessage(sessionId: string, messageId: number, fileId: string): Promise<void>;
  removeFileFromMessage(sessionId: string, messageId: number, fileId: string): Promise<void>;
  getFilesForMessage(sessionId: string, messageId: number): Promise<MessageFile[]>;
}
