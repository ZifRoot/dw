import { chat_sessions, Ichat_sessions } from "./models/chat_sessions";

export interface IItemRepository {
  findAll(): Promise<chat_sessions[]>;
  findById(id: string): Promise<chat_sessions | null>;
  create(data: Ichat_sessions): Promise<chat_sessions>;
}
