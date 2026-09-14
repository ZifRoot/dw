"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelRemainingTimeView = exports.modelProcessedStatsView = exports.modelSpeedsView = exports.modelMedianSpeedView = exports.modelAvgSpeedView = exports.speedxView = exports.progressxView = exports.modelPendingBytesView = exports.modelEfficiencyView = exports.sessionSpeedView = exports.sessionThroughputView = exports.sessions_outdating_embeddingsView = exports.sessionTotalSizeView = exports.distinctModelsView = exports.embeddingsTable = exports.messageFragmentsTable = exports.messageFilesTable = exports.filesTable = exports.chatMessagesTable = exports.chatSessionsTable = exports.userTable = exports.fileStatusEnum = exports.fragmentTypeEnum = exports.roleEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const types_1 = require("./types");
exports.roleEnum = (0, pg_core_1.text)("role");
exports.fragmentTypeEnum = (0, pg_core_1.text)("fragment_type");
exports.fileStatusEnum = (0, pg_core_1.text)("file_status");
exports.userTable = (0, pg_core_1.pgTable)("user", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull(),
    credentials: (0, pg_core_1.jsonb)("credentials"),
});
exports.chatSessionsTable = (0, pg_core_1.pgTable)("chat_sessions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    title: (0, pg_core_1.text)("title").notNull(),
    title_type: (0, pg_core_1.text)("title_type").notNull(),
    pinned: (0, pg_core_1.boolean)("pinned").default(false).notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").notNull(),
    seq_id: (0, pg_core_1.integer)("seq_id"),
    agent: (0, pg_core_1.text)("agent"),
    version: (0, pg_core_1.integer)("version"),
    current_message_id: (0, pg_core_1.integer)("current_message_id"),
    inserted_at: (0, pg_core_1.timestamp)("inserted_at"),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => exports.userTable.id),
});
exports.chatMessagesTable = (0, pg_core_1.pgTable)("chat_messages", {
    sessionId: (0, pg_core_1.uuid)("session_id")
        .notNull()
        .references(() => exports.chatSessionsTable.id),
    messageId: (0, pg_core_1.integer)("message_id").notNull(),
    parentMessageId: (0, pg_core_1.integer)("parent_message_id"),
    model: (0, pg_core_1.text)("model"),
    role: (0, pg_core_1.text)("role").notNull(),
    thinkingEnabled: (0, pg_core_1.boolean)("thinking_enabled").notNull(),
    banEdit: (0, pg_core_1.boolean)("ban_edit").notNull(),
    banRegenerate: (0, pg_core_1.boolean)("ban_regenerate").notNull(),
    status: (0, pg_core_1.text)("status").notNull(),
    accumulatedTokenUsage: (0, pg_core_1.integer)("accumulated_token_usage").notNull(),
    feedback: (0, pg_core_1.jsonb)("feedback"),
    insertedAt: (0, pg_core_1.timestamp)("inserted_at").notNull(),
    searchEnabled: (0, pg_core_1.boolean)("search_enabled").notNull(),
    hasPendingFragment: (0, pg_core_1.boolean)("has_pending_fragment").notNull(),
    autoContinue: (0, pg_core_1.boolean)("auto_continue").notNull(),
}, (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.sessionId, table.messageId] }),
    (0, pg_core_1.foreignKey)({
        columns: [table.sessionId, table.parentMessageId],
        foreignColumns: [table.sessionId, table.messageId],
    }),
    (0, pg_core_1.index)("chat_messages_parent_idx").on(table.sessionId, table.parentMessageId),
    (0, pg_core_1.index)("chat_messages_session_id_idx").on(table.sessionId),
]);
exports.filesTable = (0, pg_core_1.pgTable)("files", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    status: (0, pg_core_1.text)("status").notNull(),
    file_name: (0, pg_core_1.text)("file_name").notNull(),
    previewable: (0, pg_core_1.boolean)("previewable").notNull(),
    file_size: (0, pg_core_1.integer)("file_size").notNull(),
    token_usage: (0, pg_core_1.integer)("token_usage").notNull(),
    error_code: (0, pg_core_1.integer)("error_code"),
    inserted_at: (0, pg_core_1.timestamp)("inserted_at").notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").notNull(),
    content: (0, types_1.bytea)("content"),
});
exports.messageFilesTable = (0, pg_core_1.pgTable)("message_files", {
    sessionId: (0, pg_core_1.uuid)("session_id")
        .notNull()
        .references(() => exports.chatSessionsTable.id),
    messageId: (0, pg_core_1.integer)("message_id").notNull(),
    fileId: (0, pg_core_1.uuid)("file_id")
        .notNull()
        .references(() => exports.filesTable.id),
}, (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.sessionId, table.messageId, table.fileId] }),
    (0, pg_core_1.foreignKey)({
        columns: [table.sessionId, table.messageId],
        foreignColumns: [exports.chatMessagesTable.sessionId, exports.chatMessagesTable.messageId],
    }),
    (0, pg_core_1.index)("message_files_message_idx").on(table.sessionId, table.messageId),
    (0, pg_core_1.index)("message_files_file_idx").on(table.fileId),
]);
exports.messageFragmentsTable = (0, pg_core_1.pgTable)("message_fragments", {
    sessionId: (0, pg_core_1.uuid)("session_id")
        .notNull()
        .references(() => exports.chatSessionsTable.id, { onDelete: "cascade" }),
    messageId: (0, pg_core_1.integer)("message_id").notNull(),
    fragmentOrder: (0, pg_core_1.integer)("fragment_order").notNull(),
    type: (0, pg_core_1.text)("type").notNull(),
    content: (0, pg_core_1.text)("content").notNull(),
    elapsed_secs: (0, pg_core_1.doublePrecision)("elapsed_secs"),
    references: (0, pg_core_1.jsonb)("references"),
    stage_id: (0, pg_core_1.integer)("stage_id"),
    size: (0, pg_core_1.integer)("size").notNull(),
}, (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.sessionId, table.messageId, table.fragmentOrder] }),
    (0, pg_core_1.index)("message_fragments_message_idx").on(table.sessionId, table.messageId),
    (0, pg_core_1.foreignKey)({
        columns: [table.sessionId, table.messageId],
        foreignColumns: [exports.chatMessagesTable.sessionId, exports.chatMessagesTable.messageId],
    }),
]);
exports.embeddingsTable = (0, pg_core_1.pgTable)("embeddings", {
    sessionId: (0, pg_core_1.uuid)("session_id")
        .notNull()
        .references(() => exports.chatSessionsTable.id, { onDelete: "cascade" }),
    model_name: (0, pg_core_1.varchar)("model_name", { length: 80 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    dimension: (0, pg_core_1.integer)("dimension").notNull(),
    processing_time_ms: (0, pg_core_1.real)("processing_time_ms").notNull(),
    embedding: (0, pg_core_1.jsonb)("embedding_vector"),
}, (table) => [(0, pg_core_1.primaryKey)({ columns: [table.sessionId, table.model_name, table.createdAt] })]);
exports.distinctModelsView = (0, pg_core_1.pgView)("distinct_models").as((qb) => qb.selectDistinct({ model_name: exports.embeddingsTable.model_name }).from(exports.embeddingsTable));
exports.sessionTotalSizeView = (0, pg_core_1.pgView)("session_total_size", {
    session_id: (0, pg_core_1.uuid)("session_id"),
    total_bytes: (0, pg_core_1.integer)("total_bytes"),
}).as((0, drizzle_orm_1.sql) `
  SELECT 
    session_id, 
    sum(size) AS total_bytes
  FROM message_fragments
  WHERE type = 'RESPONSE'
  GROUP BY session_id
`);
exports.sessions_outdating_embeddingsView = (0, pg_core_1.pgView)("sessions_outdating_embeddings").as((qb) => qb
    .select({
    session_id: exports.chatSessionsTable.id,
    title: exports.chatSessionsTable.title,
    model_name: exports.embeddingsTable.model_name,
})
    .from(exports.chatSessionsTable)
    .innerJoin(exports.embeddingsTable, (0, drizzle_orm_1.sql) `${exports.chatSessionsTable.id} = ${exports.embeddingsTable.sessionId}`)
    .where((0, drizzle_orm_1.sql) `${exports.chatSessionsTable.updated_at} > ${exports.embeddingsTable.createdAt}`));
exports.sessionThroughputView = (0, pg_core_1.pgView)("session_throughput", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    session_id: (0, pg_core_1.uuid)("session_id"),
    total_bytes: (0, pg_core_1.integer)("total_bytes"),
    processing_time_ms: (0, pg_core_1.real)("processing_time_ms"),
    bytes_per_ms: (0, pg_core_1.real)("bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
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
exports.sessionSpeedView = (0, pg_core_1.pgView)("session_speed", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    session_id: (0, pg_core_1.uuid)("session_id"),
    total_bytes: (0, pg_core_1.integer)("total_bytes"),
    processing_time_ms: (0, pg_core_1.real)("processing_time_ms"),
    speed_bytes_per_ms: (0, pg_core_1.real)("speed_bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
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
exports.modelEfficiencyView = (0, pg_core_1.pgView)("model_efficiency", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    avg_ms_per_byte: (0, pg_core_1.real)("avg_ms_per_byte"),
    median_ms_per_byte: (0, pg_core_1.real)("median_ms_per_byte"),
    sample_count: (0, pg_core_1.integer)("sample_count"),
}).as((0, drizzle_orm_1.sql) `
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
  `);
exports.modelPendingBytesView = (0, pg_core_1.pgView)("model_pending_bytes", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    pending_bytes: (0, pg_core_1.integer)("pending_bytes"),
}).as((0, drizzle_orm_1.sql) `
    SELECT dm.model_name,
           COALESCE(( SELECT sum(sts.total_bytes) AS sum
                      FROM session_total_size sts
                      WHERE NOT (EXISTS ( SELECT 1
                                          FROM embeddings e
                                          WHERE e.session_id = sts.session_id 
                                            AND e.model_name::text = dm.model_name::text))), 0::numeric) AS pending_bytes
    FROM distinct_models dm
  `);
exports.progressxView = (0, pg_core_1.pgView)("progressx", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    count: (0, pg_core_1.integer)("count"),
    all: (0, pg_core_1.integer)("all"),
    l: (0, pg_core_1.integer)("l"),
}).as((0, drizzle_orm_1.sql) `
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
  `);
exports.speedxView = (0, pg_core_1.pgView)("speedx", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    total_data_size: (0, pg_core_1.integer)("total_data_size"),
    total_time_ms: (0, pg_core_1.integer)("total_time_ms"),
    speed_size_per_ms: (0, pg_core_1.real)("speed_size_per_ms"),
    speed_size_per_sec: (0, pg_core_1.real)("speed_size_per_sec"),
}).as((0, drizzle_orm_1.sql) `
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
  `);
exports.modelAvgSpeedView = (0, pg_core_1.pgView)("model_avg_speed", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    avg_bytes_per_ms: (0, pg_core_1.real)("avg_bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
    SELECT session_throughput.model_name,
           CASE
               WHEN sum(session_throughput.processing_time_ms) > 0::double precision 
               THEN sum(session_throughput.total_bytes)::double precision / sum(session_throughput.processing_time_ms)
               ELSE NULL::double precision
           END AS avg_bytes_per_ms
    FROM session_throughput
    GROUP BY session_throughput.model_name
  `);
exports.modelMedianSpeedView = (0, pg_core_1.pgView)("model_median_speed", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    median_bytes_per_ms: (0, pg_core_1.real)("median_bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
    SELECT session_throughput.model_name,
           percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY session_throughput.bytes_per_ms) AS median_bytes_per_ms
    FROM session_throughput
    WHERE session_throughput.bytes_per_ms IS NOT NULL
    GROUP BY session_throughput.model_name
  `);
exports.modelSpeedsView = (0, pg_core_1.pgView)("model_speeds", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    avg_bytes_per_ms: (0, pg_core_1.real)("avg_bytes_per_ms"),
    median_bytes_per_ms: (0, pg_core_1.real)("median_bytes_per_ms"),
    min_bytes_per_ms: (0, pg_core_1.real)("min_bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
    SELECT COALESCE(avg.model_name, med.model_name) AS model_name,
           avg.avg_bytes_per_ms,
           med.median_bytes_per_ms,
           LEAST(COALESCE(avg.avg_bytes_per_ms, med.median_bytes_per_ms), COALESCE(med.median_bytes_per_ms, avg.avg_bytes_per_ms)) AS min_bytes_per_ms
    FROM model_avg_speed avg
    FULL JOIN model_median_speed med ON avg.model_name::text = med.model_name::text
  `);
exports.modelProcessedStatsView = (0, pg_core_1.pgView)("model_processed_stats", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    processed_bytes: (0, pg_core_1.integer)("processed_bytes"),
    total_time_ms: (0, pg_core_1.integer)("total_time_ms"),
    avg_bytes_per_ms: (0, pg_core_1.real)("avg_bytes_per_ms"),
    median_bytes_per_ms: (0, pg_core_1.real)("median_bytes_per_ms"),
    speed_bytes_per_ms: (0, pg_core_1.real)("speed_bytes_per_ms"),
}).as((0, drizzle_orm_1.sql) `
    SELECT e.model_name,
           sum(sts.total_bytes) AS processed_bytes,
           sum(e.processing_time_ms) AS total_time_ms,
           s.avg_bytes_per_ms,
           s.median_bytes_per_ms,
           s.min_bytes_per_ms AS speed_bytes_per_ms
    FROM embeddings e
    JOIN session_total_size sts ON e.session_id = sts.session_id
    LEFT JOIN model_speeds s ON e.model_name::text = s.model_name::text
    GROUP BY e.model_name, s.avg_bytes_per_ms, s.median_bytes_per_ms, s.min_bytes_per_ms
  `);
exports.modelRemainingTimeView = (0, pg_core_1.pgView)("model_remaining_time", {
    model_name: (0, pg_core_1.varchar)("model_name"),
    pending_bytes: (0, pg_core_1.integer)("pending_bytes"),
    processed_bytes: (0, pg_core_1.integer)("processed_bytes"),
    total_time_ms: (0, pg_core_1.integer)("total_time_ms"),
    speed_bytes_per_ms: (0, pg_core_1.real)("speed_bytes_per_ms"),
    avg_bytes_per_ms: (0, pg_core_1.real)("avg_bytes_per_ms"),
    median_bytes_per_ms: (0, pg_core_1.real)("median_bytes_per_ms"),
    remaining_time_ms: (0, pg_core_1.real)("remaining_time_ms"),
    remaining_time_human: (0, pg_core_1.text)("remaining_time_human"),
}).as((0, drizzle_orm_1.sql) `
    SELECT pb.model_name,
           pb.pending_bytes,
           ps.processed_bytes,
           ps.total_time_ms,
           ps.speed_bytes_per_ms,
           ps.avg_bytes_per_ms,
           ps.median_bytes_per_ms,
           CASE
               WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision 
               THEN pb.pending_bytes::double precision / ps.speed_bytes_per_ms
               ELSE NULL::double precision
           END AS remaining_time_ms,
           CASE
               WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision 
               THEN ( SELECT format('%s days %s hours %s minutes %s seconds %s ms'::text, 
                                     (t.ms / 86400000)::text, 
                                     (t.ms % 86400000::bigint / 3600000)::text, 
                                     (t.ms % 3600000::bigint / 60000)::text, 
                                     (t.ms % 60000::bigint / 1000)::text, 
                                     (t.ms % 1000::bigint)::text) AS format
                      FROM ( SELECT (pb.pending_bytes::double precision / ps.speed_bytes_per_ms)::bigint AS ms) t)
               ELSE NULL::text
           END AS remaining_time_human
    FROM model_pending_bytes pb
    LEFT JOIN model_processed_stats ps ON pb.model_name::text = ps.model_name::text
  `);
