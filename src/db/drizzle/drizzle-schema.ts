import { pgTable, uuid, text, boolean, timestamp, integer, doublePrecision, jsonb, primaryKey, foreignKey, index } from "drizzle-orm/pg-core";
import { bytea } from "./types";

// Enums реализованы как text (согласно вашему пожеланию)
export const roleEnum = text("role");
export const fragmentTypeEnum = text("fragment_type");
export const fileStatusEnum = text("file_status");

export const userTable = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  credentials: jsonb("credentials"),
});

// ========================
// Таблица сессий (уже существовала)
// ========================
export const chatSessionsTable = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  title_type: text("title_type").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  updated_at: timestamp("updated_at").notNull(),
  // дополнительные поля для полной версии (опциональны)
  seq_id: integer("seq_id"),
  agent: text("agent"),
  version: integer("version"),
  current_message_id: integer("current_message_id"),
  inserted_at: timestamp("inserted_at"),
  user_id: uuid("user_id").references(() => userTable.id),
});

// ========================
// Таблица сообщений с составным ключом (session_id, message_id)
// ========================
export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id),
    messageId: integer("message_id").notNull(),
    parentMessageId: integer("parent_message_id"),
    model: text("model"),
    role: text("role").notNull(),
    thinkingEnabled: boolean("thinking_enabled").notNull(),
    banEdit: boolean("ban_edit").notNull(),
    banRegenerate: boolean("ban_regenerate").notNull(),
    status: text("status").notNull(),
    accumulatedTokenUsage: integer("accumulated_token_usage").notNull(),
    feedback: jsonb("feedback"),
    insertedAt: timestamp("inserted_at").notNull(),
    searchEnabled: boolean("search_enabled").notNull(),
    hasPendingFragment: boolean("has_pending_fragment").notNull(),
    autoContinue: boolean("auto_continue").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.messageId] }),
    foreignKey({
      columns: [table.sessionId, table.parentMessageId],
      foreignColumns: [table.sessionId, table.messageId],
    }),
    index("chat_messages_parent_idx").on(table.sessionId, table.parentMessageId),
    index("chat_messages_session_id_idx").on(table.sessionId),
  ],
);

// ========================
// Таблица файлов (независимая)
// ========================
export const filesTable = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull(),
  file_name: text("file_name").notNull(),
  previewable: boolean("previewable").notNull(),
  file_size: integer("file_size").notNull(),
  token_usage: integer("token_usage").notNull(),
  error_code: integer("error_code"),
  inserted_at: timestamp("inserted_at").notNull(),
  updated_at: timestamp("updated_at").notNull(),
  content: bytea("content"),
});

// ========================
// Связь сообщений и файлов (многие-ко-многим)
// ========================
export const messageFilesTable = pgTable(
  "message_files",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id),
    messageId: integer("message_id").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => filesTable.id),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.messageId, table.fileId] }),
    foreignKey({
      columns: [table.sessionId, table.messageId],
      foreignColumns: [chatMessagesTable.sessionId, chatMessagesTable.messageId],
    }),
    index("message_files_message_idx").on(table.sessionId, table.messageId),
    index("message_files_file_idx").on(table.fileId),
  ],
);

// ========================
// Таблица фрагментов сообщений
// ========================
export const messageFragmentsTable = pgTable(
  "message_fragments",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id),
    messageId: integer("message_id").notNull(),
    fragmentOrder: integer("fragment_order").notNull(),
    type: text("type").notNull(),
    content: text("content").notNull(),
    elapsed_secs: doublePrecision("elapsed_secs"),
    references: jsonb("references"),
    stage_id: integer("stage_id"),
    size: integer("size").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.messageId, table.fragmentOrder] }),
    index("message_fragments_message_idx").on(table.sessionId, table.messageId),
    foreignKey({
      columns: [table.sessionId, table.messageId],
      foreignColumns: [chatMessagesTable.sessionId, chatMessagesTable.messageId],
    }),
  ],
);

// drizzle-schema.ts (дополнение)
export const embeddingsTable = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id, { onDelete: "cascade" }),
    model_name: text("model_name").notNull(),
    dimension: integer("dimension").notNull(),
    processing_time_ms: integer("processing_time_ms").notNull(),
    embedding: jsonb("embedding_vector"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("embeddings_session_idx").on(table.sessionId)],
);
