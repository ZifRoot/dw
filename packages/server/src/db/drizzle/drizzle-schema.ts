import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  primaryKey,
  foreignKey,
  index,
  real,
  varchar,
  pgView,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
      .references(() => chatSessionsTable.id, { onDelete: "cascade" }),
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

// Таблица эмбеддингов с составным PK (sessionId, modelId)
export const embeddingsTable = pgTable(
  "embeddings",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id, { onDelete: "cascade" }),
    model_name: varchar("model_name", { length: 80 }).notNull(), // ограничение 50 символов
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dimension: integer("dimension").notNull(),
    processing_time_ms: real("processing_time_ms").notNull(),
    embedding: jsonb("embedding_vector"),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.model_name, table.createdAt] })],
);

// Добавьте этот импорт в начало файла, если его нет

// ====================================================================
// 1. Простые представления через query builder
// ====================================================================

// distinct_models
export const distinctModelsView = pgView("distinct_models").as((qb) =>
  qb.selectDistinct({ model_name: embeddingsTable.model_name }).from(embeddingsTable),
);

// session_total_size (raw)
export const sessionTotalSizeView = pgView("session_total_size", {
  session_id: uuid("session_id"),
  total_bytes: integer("total_bytes"),
}).as(sql`
  SELECT 
    session_id, 
    sum(size) AS total_bytes
  FROM message_fragments
  WHERE type = 'RESPONSE'
  GROUP BY session_id
`);

export const sessions_outdating_embeddingsView = pgView("sessions_outdating_embeddings").as((qb) =>
  qb
    .select({
      session_id: chatSessionsTable.id,
      title: chatSessionsTable.title,
      model_name: embeddingsTable.model_name,
    })
    .from(chatSessionsTable)
    .innerJoin(embeddingsTable, sql`${chatSessionsTable.id} = ${embeddingsTable.sessionId}`)
    .where(sql`${chatSessionsTable.updated_at} > ${embeddingsTable.createdAt}`),
);

// session_throughput (raw)
export const sessionThroughputView = pgView("session_throughput", {
  model_name: varchar("model_name"),
  session_id: uuid("session_id"),
  total_bytes: integer("total_bytes"),
  processing_time_ms: real("processing_time_ms"),
  bytes_per_ms: real("bytes_per_ms"),
}).as(sql`
  SELECT 
    e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
    CASE 
      WHEN e.processing_time_ms > 0 
      THEN sts.total_bytes::double precision / e.processing_time_ms 
      ELSE NULL 
    END AS bytes_per_ms
  FROM embeddings e
  JOIN session_total_size sts ON e.session_id = sts.session_id
`);

// session_speed (raw)
export const sessionSpeedView = pgView("session_speed", {
  model_name: varchar("model_name"),
  session_id: uuid("session_id"),
  total_bytes: integer("total_bytes"),
  processing_time_ms: real("processing_time_ms"),
  speed_bytes_per_ms: real("speed_bytes_per_ms"),
}).as(sql`
  SELECT 
    e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
    CASE 
      WHEN e.processing_time_ms > 0 
      THEN sts.total_bytes::double precision / e.processing_time_ms 
      ELSE NULL 
    END AS speed_bytes_per_ms
  FROM embeddings e
  JOIN session_total_size sts ON e.session_id = sts.session_id
`);

// model_efficiency
export const modelEfficiencyView = pgView("model_efficiency", {
  model_name: varchar("model_name"),
  avg_ms_per_byte: real("avg_ms_per_byte"),
  median_ms_per_byte: real("median_ms_per_byte"),
  sample_count: integer("sample_count"),
}).as(
  sql`
    WITH session_sizes AS (
         SELECT message_fragments.session_id,
                sum(message_fragments.size) AS total_size
         FROM message_fragments
         GROUP BY message_fragments.session_id
    ), model_processed AS (
         SELECT e.model_name,
                e.session_id,
                e.processing_time_ms,
                ss.total_size
         FROM embeddings e
         JOIN session_sizes ss ON e.session_id = ss.session_id
         WHERE ss.total_size > 0
    )
    SELECT model_processed.model_name,
           avg(model_processed.processing_time_ms / model_processed.total_size::double precision) AS avg_ms_per_byte,
           percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (model_processed.processing_time_ms / model_processed.total_size::double precision)) AS median_ms_per_byte,
           count(*) AS sample_count
    FROM model_processed
    GROUP BY model_processed.model_name
  `,
);

// model_pending_bytes
export const modelPendingBytesView = pgView("model_pending_bytes", {
  model_name: varchar("model_name"),
  pending_bytes: integer("pending_bytes"),
}).as(
  sql`
    SELECT dm.model_name,
           COALESCE(( SELECT sum(sts.total_bytes) AS sum
                      FROM session_total_size sts
                      WHERE NOT (EXISTS ( SELECT 1
                                          FROM embeddings e
                                          WHERE e.session_id = sts.session_id 
                                            AND e.model_name::text = dm.model_name::text))), 0::numeric) AS pending_bytes
    FROM distinct_models dm
  `,
);

// progressx
export const progressxView = pgView("progressx", {
  model_name: varchar("model_name"),
  count: integer("count"),
  all: integer("all"),
  l: integer("l"),
}).as(
  sql`
    SELECT m.model_name,
           m.count,
           m."all",
           m."all" - m.count AS l
    FROM ( SELECT e.model_name,
                  count(e.session_id) AS count,
                  ( SELECT count(cs.id) AS count
                    FROM chat_sessions cs ) AS "all"
           FROM embeddings e
           GROUP BY e.model_name ) m
  `,
);

// speedx
export const speedxView = pgView("speedx", {
  model_name: varchar("model_name"),
  total_data_size: integer("total_data_size"),
  total_time_ms: integer("total_time_ms"),
  speed_size_per_ms: real("speed_size_per_ms"),
  speed_size_per_sec: real("speed_size_per_sec"),
}).as(
  sql`
    WITH session_size AS (
         SELECT cs.id,
                COALESCE(fs.sum_frag, 0::bigint) + COALESCE(fls.sum_file, 0::bigint) AS size
         FROM chat_sessions cs
         LEFT JOIN ( SELECT message_fragments.session_id,
                            sum(message_fragments.size) AS sum_frag
                     FROM message_fragments
                     GROUP BY message_fragments.session_id ) fs ON cs.id = fs.session_id
         LEFT JOIN ( SELECT mf.session_id,
                            sum(f.file_size) AS sum_file
                     FROM message_files mf
                     JOIN files f ON mf.file_id = f.id
                     GROUP BY mf.session_id ) fls ON cs.id = fls.session_id
    )
    SELECT e.model_name,
           sum(ss.size) AS total_data_size,
           sum(e.processing_time_ms) AS total_time_ms,
           sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) AS speed_size_per_ms,
           sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) * 1000::double precision AS speed_size_per_sec
    FROM embeddings e
    JOIN session_size ss ON e.session_id = ss.id
    GROUP BY e.model_name
    ORDER BY (sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision)) DESC
  `,
);

// ====================================================================
// 2. Сложные представления через сырой SQL (raw)
// ====================================================================

// model_avg_speed
export const modelAvgSpeedView = pgView("model_avg_speed", {
  model_name: varchar("model_name"),
  avg_bytes_per_ms: real("avg_bytes_per_ms"),
}).as(
  sql`
    SELECT session_throughput.model_name,
           CASE
               WHEN sum(session_throughput.processing_time_ms) > 0::double precision 
               THEN sum(session_throughput.total_bytes)::double precision / sum(session_throughput.processing_time_ms)
               ELSE NULL::double precision
           END AS avg_bytes_per_ms
    FROM session_throughput
    GROUP BY session_throughput.model_name
  `,
);

// model_median_speed
export const modelMedianSpeedView = pgView("model_median_speed", {
  model_name: varchar("model_name"),
  median_bytes_per_ms: real("median_bytes_per_ms"),
}).as(
  sql`
    SELECT session_throughput.model_name,
           percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY session_throughput.bytes_per_ms) AS median_bytes_per_ms
    FROM session_throughput
    WHERE session_throughput.bytes_per_ms IS NOT NULL
    GROUP BY session_throughput.model_name
  `,
);

// model_speeds
export const modelSpeedsView = pgView("model_speeds", {
  model_name: varchar("model_name"),
  avg_bytes_per_ms: real("avg_bytes_per_ms"),
  median_bytes_per_ms: real("median_bytes_per_ms"),
  min_bytes_per_ms: real("min_bytes_per_ms"),
}).as(
  sql`
    SELECT COALESCE(avg.model_name, med.model_name) AS model_name,
           avg.avg_bytes_per_ms,
           med.median_bytes_per_ms,
           LEAST(COALESCE(avg.avg_bytes_per_ms, med.median_bytes_per_ms), COALESCE(med.median_bytes_per_ms, avg.avg_bytes_per_ms)) AS min_bytes_per_ms
    FROM model_avg_speed avg
    FULL JOIN model_median_speed med ON avg.model_name::text = med.model_name::text
  `,
);
