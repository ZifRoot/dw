// src/infrastructure/repositories/prisma-item.repository.ts
import { chat_sessions, Ichat_sessions } from "./models/chat_sessions";
import { IItemRepository } from "./IItemRepository";
import { PrismaClient } from "../generated/prisma/client";

export class PrismaItemRepository implements IItemRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<chat_sessions[]> {
    const items = await this.prisma.chat_sessions.findMany();
    return items.map((item) => new chat_sessions(item));
  }

  async findById(id: string): Promise<chat_sessions | null> {
    const item = await this.prisma.chat_sessions.findUnique({
      where: { id: id },
    });
    return item ? new chat_sessions(item) : null;
  }

  async create(data: Ichat_sessions): Promise<chat_sessions> {
    const created = await this.prisma.chat_sessions.create({
      data: new chat_sessions(data),
    });

    return new chat_sessions(created);
  }
}
