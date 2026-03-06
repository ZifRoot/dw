import { pgTable, uuid, text, boolean, timestamp, integer, doublePrecision, jsonb, primaryKey, foreignKey, index, pgEnum } from "drizzle-orm/pg-core";

// ========================
// Enums
// ========================
export const roleEnum = text; // pgEnum("role", ["USER", "ASSISTANT"]);
export const fragmentTypeEnum = text; //pgEnum("fragment_type", ["REQUEST", "THINK", "RESPONSE"]);
export const fileStatusEnum = text; //pgEnum("file_status", ["SUCCESS", "PENDING", "ERROR"]);

// ========================
// Таблица сессий (уже существующая)
// ========================
export const chatSessionsTable = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  title_type: text("title_type").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  updated_at: timestamp("updated_at").notNull(),
});

// ========================
// Таблица сообщений
// ========================
export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    messageId: integer("message_id").primaryKey(),
    parentId: integer("parent_id"),
    sessionId: uuid("session_id")
      .references(() => chatSessionsTable.id)
      .notNull(),
    model: text("model"),
    role: roleEnum("role").notNull(),
    thinkingEnabled: boolean("thinking_enabled").notNull(),
    banEdit: boolean("ban_edit").notNull(),
    banRegenerate: boolean("ban_regenerate").notNull(),
    status: text("status").notNull(), // можно использовать enum, если нужен строгий набор
    accumulatedTokenUsage: integer("accumulated_token_usage").notNull(),
    feedback: jsonb("feedback"),
    insertedAt: timestamp("inserted_at").notNull(), // преобразование из числа с дробной частью в timestamp
    searchEnabled: boolean("search_enabled").notNull(),
    hasPendingFragment: boolean("has_pending_fragment").notNull(),
    autoContinue: boolean("auto_continue").notNull(),
  },
  (table) => ({
    parentFk: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.messageId],
    }),
    parentIdx: index("chat_messages_parent_id_idx").on(table.parentId),
    sessionIdx: index("chat_messages_session_id_idx").on(table.sessionId),
  }),
);

// ========================
// Таблица файлов
// ========================
export const filesTable = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: fileStatusEnum("status").notNull(),
  fileName: text("file_name").notNull(),
  previewable: boolean("previewable").notNull(),
  fileSize: integer("file_size").notNull(),
  tokenUsage: integer("token_usage").notNull(),
  errorCode: integer("error_code"),
  insertedAt: timestamp("inserted_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ========================
// Связующая таблица сообщений и файлов (многие-ко-многим)
// ========================
export const messageFilesTable = pgTable(
  "message_files",
  {
    messageId: integer("message_id")
      .references(() => chatMessagesTable.messageId)
      .notNull(),
    fileId: uuid("file_id")
      .references(() => filesTable.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.fileId] }),
    messageIdx: index("message_files_message_id_idx").on(table.messageId),
    fileIdx: index("message_files_file_id_idx").on(table.fileId),
  }),
);

// ========================
// Таблица фрагментов сообщений
// ========================
export const messageFragmentsTable = pgTable(
  "message_fragments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: integer("message_id")
      .references(() => chatMessagesTable.messageId)
      .notNull(),
    fragmentOrder: integer("fragment_order").notNull(), // для сохранения порядка фрагментов
    type: fragmentTypeEnum("type").notNull(),
    content: text("content").notNull(),
    elapsedSecs: doublePrecision("elapsed_secs"),
    references: jsonb("references"),
    stageId: integer("stage_id"),
  },
  (table) => ({
    messageIdx: index("message_fragments_message_id_idx").on(table.messageId),
  }),
);
