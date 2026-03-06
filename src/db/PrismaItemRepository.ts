// src/infrastructure/repositories/prisma-item.repository.ts
import { chat_sessions, Ichat_sessions } from "./models/chat_sessions";
import { IItemRepository } from "./IItemRepository";
import { uuidToBuffer } from "../utils/data-utils";
import { v4 as uuidv4, parse as uuidParse } from "uuid";
import { randomUUID } from "crypto";
import { PrismaClient } from "../generated/prisma/client";

export class PrismaItemRepository implements IItemRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(): Promise<chat_sessions[]> {
    const items = await this.prisma.chat_sessions.findMany();
    // Prisma возвращает объекты с id типа Buffer, остальные поля как есть
    return items.map((item) => new chat_sessions(item));
  }

  async findById(id: string): Promise<chat_sessions | null> {
    const bufferId = uuidToBuffer(id);
    const item = await this.prisma.chat_sessions.findUnique({
      where: { id: id },
    });
    return item ? new chat_sessions(item) : null;
  }

  async create(data: Ichat_sessions): Promise<chat_sessions> {
    const cs = new chat_sessions(data);
    const rawUuid = randomUUID();

    // 1. Получаем Uint8Array из UUID
    const uint8 = uuidParse(rawUuid);

    const created = await this.prisma.chat_sessions.create({
      data: {
        // Пытаемся передать как Uint8Array.
        // Если TS ругается, используйте: Buffer.from(uint8)
        id: rawUuid,
        pinned: cs.pinned,
        title: cs.title,
        title_type: cs.title_type,
        updated_at: cs.updated_at!,
      },
    });

    return new chat_sessions(created);
  }
}
