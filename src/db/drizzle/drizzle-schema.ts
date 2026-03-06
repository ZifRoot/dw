import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const chatSessionsTable = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  title_type: text("title_type").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  updated_at: timestamp("updated_at").notNull(),
});
