import { eq, sql } from "drizzle-orm";
import { db_drizzle } from "./drizzle/drizzle-db";
import { chatSessionsTable } from "./drizzle/drizzle-schema";
import { IItemRepository } from "./IItemRepository";
import { chat_sessions, Ichat_sessions } from "./models/chat_sessions";

export class DrizzleItemRepository implements IItemRepository {
  // Вместо PrismaClient используем объект базы Drizzle
  constructor(private client: typeof db_drizzle) {}

  async findAll(): Promise<chat_sessions[]> {
    const items = await this.client.select().from(chatSessionsTable);
    return items.map((item) => new chat_sessions(item));
  }

  async findById(id: string): Promise<chat_sessions | null> {
    const [item] = await this.client.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, id));

    return item ? new chat_sessions(item) : null;
  }

  async create(data: Ichat_sessions): Promise<chat_sessions> {
    const values = new chat_sessions(data);

    const [result] = await this.client
      .insert(chatSessionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatSessionsTable.id,
        set: {
          title: sql`excluded.title`,
          title_type: sql`excluded.title_type`,
          pinned: sql`excluded.pinned`,
          updated_at: sql`excluded.updated_at`,
        },
      })
      .returning();

    return new chat_sessions(result);
  }

  async createMany(data: Ichat_sessions[]): Promise<number> {
    if (data.length === 0) return 0;

    const values = data.map((ch) => new chat_sessions(ch));

    const result = await this.client
      .insert(chatSessionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatSessionsTable.id,
        set: {
          title: sql`excluded.title`,
          title_type: sql`excluded.title_type`,
          pinned: sql`excluded.pinned`,
          updated_at: sql`excluded.updated_at`,
        },
      });

    // В некоторых драйверах rowCount может быть null, поэтому ставим защиту
    return result.rowCount ?? 0;
  }
}
