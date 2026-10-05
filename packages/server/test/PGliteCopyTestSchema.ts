import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { bytea } from "../src/db/drizzle/types";

export const copyRowsTable = pgTable("copy_rows_drizzle", {
  id: integer("id").primaryKey(),
  content: text("content").notNull(),
  payload: bytea("payload").notNull(),
});

export type CopyRowsInsert = typeof copyRowsTable.$inferInsert;
export type CopyRowsSelect = typeof copyRowsTable.$inferSelect;
