import { PGlite } from "@electric-sql/pglite";
import { getTableColumns } from "drizzle-orm";
import {
  chatMessagesTable,
  chatSessionsTable,
  embeddingsTable,
  filesTable,
  messageFilesTable,
  messageFragmentsTable,
  userTable,
} from "../drizzle/drizzle-schema";
import {
  createBinaryCopyFromDrizzleTable,
} from "../../utils/drizzle-binary-copy";
import {
  BACKUP_TABLES,
  BACKUP_TABLE_ORDER,
} from "./sqlite-backup-schema";
import { readSqliteBackup } from "./sqlite-backup";

const PG_TABLE_DDL: Record<string, string> = {
  user: 'CREATE TABLE "user" ("id" uuid PRIMARY KEY NOT NULL, "name" text NOT NULL, "credentials" jsonb)',
  chat_sessions:
    'CREATE TABLE "chat_sessions" ("id" uuid PRIMARY KEY NOT NULL, "title" text NOT NULL, "title_type" text NOT NULL, "pinned" boolean DEFAULT false NOT NULL, "updated_at" timestamp NOT NULL, "seq_id" integer, "agent" text, "version" integer, "current_message_id" integer, "inserted_at" timestamp, "user_id" uuid)',
  chat_messages:
    'CREATE TABLE "chat_messages" ("session_id" uuid NOT NULL, "message_id" integer NOT NULL, "parent_message_id" integer, "model" text, "role" text NOT NULL, "thinking_enabled" boolean NOT NULL, "ban_edit" boolean NOT NULL, "ban_regenerate" boolean NOT NULL, "status" text NOT NULL, "accumulated_token_usage" integer NOT NULL, "feedback" jsonb, "inserted_at" timestamp NOT NULL, "search_enabled" boolean NOT NULL, "has_pending_fragment" boolean NOT NULL, "auto_continue" boolean NOT NULL, PRIMARY KEY ("session_id", "message_id"))',
  files:
    'CREATE TABLE "files" ("id" uuid PRIMARY KEY NOT NULL, "status" text NOT NULL, "file_name" text NOT NULL, "previewable" boolean NOT NULL, "file_size" integer NOT NULL, "token_usage" integer NOT NULL, "error_code" integer, "inserted_at" timestamp NOT NULL, "updated_at" timestamp NOT NULL, "content" bytea)',
  message_files:
    'CREATE TABLE "message_files" ("session_id" uuid NOT NULL, "message_id" integer NOT NULL, "file_id" uuid NOT NULL, PRIMARY KEY ("session_id", "message_id", "file_id"))',
  message_fragments:
    'CREATE TABLE "message_fragments" ("session_id" uuid NOT NULL, "message_id" integer NOT NULL, "fragment_order" integer NOT NULL, "type" text NOT NULL, "content" text NOT NULL, "elapsed_secs" double precision, "references" jsonb, "stage_id" integer, "size" integer NOT NULL, PRIMARY KEY ("session_id", "message_id", "fragment_order"))',
  embeddings:
    'CREATE TABLE "embeddings" ("session_id" uuid NOT NULL, "model_name" varchar(80) NOT NULL, "created_at" timestamp with time zone NOT NULL, "dimension" integer NOT NULL, "processing_time_ms" real NOT NULL, "embedding_vector" jsonb, PRIMARY KEY ("session_id", "model_name", "created_at"))',
};

const PG_INDEXES = [
  'CREATE INDEX "chat_messages_parent_idx" ON "chat_messages" ("session_id", "parent_message_id")',
  'CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" ("session_id")',
  'CREATE INDEX "message_files_message_idx" ON "message_files" ("session_id", "message_id")',
  'CREATE INDEX "message_files_file_idx" ON "message_files" ("file_id")',
  'CREATE INDEX "message_fragments_message_idx" ON "message_fragments" ("session_id", "message_id")',
];

const PG_FOREIGN_KEYS = [
  'ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION',
  'ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE NO ACTION',
  'ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_parent_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id", "parent_message_id") REFERENCES "chat_messages"("session_id", "message_id") ON DELETE NO ACTION',
  'ALTER TABLE "message_files" ADD CONSTRAINT "message_files_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE NO ACTION',
  'ALTER TABLE "message_files" ADD CONSTRAINT "message_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION',
  'ALTER TABLE "message_files" ADD CONSTRAINT "message_files_session_id_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id", "message_id") REFERENCES "chat_messages"("session_id", "message_id") ON DELETE NO ACTION',
  'ALTER TABLE "message_fragments" ADD CONSTRAINT "message_fragments_session_id_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id", "message_id") REFERENCES "chat_messages"("session_id", "message_id") ON DELETE NO ACTION',
  'ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE',
];

const DRIZZLE_TABLES = {
  user: userTable,
  chat_sessions: chatSessionsTable,
  chat_messages: chatMessagesTable,
  files: filesTable,
  message_files: messageFilesTable,
  message_fragments: messageFragmentsTable,
  embeddings: embeddingsTable,
} as const;

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function stagingType(sqlType: string): string {
  switch (sqlType) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "real":
      return "real";
    case "doublePrecision":
      return "double precision";
    case "bytea":
      return "bytea";
    default:
      return "text";
  }
}

function targetExpression(sqlType: string, columnName: string): string {
  const identifier = quoteIdentifier(columnName);

  switch (sqlType) {
    case "uuid":
      return identifier + "::uuid";
    case "jsonb":
      return identifier + "::jsonb";
    case "timestamp":
      return identifier + "::timestamp";
    case "varchar":
      return identifier + "::varchar";
    case "timestamp with time zone":
      return identifier + "::timestamptz";
    case "timestamp without time zone":
      return identifier + "::timestamp";
    default:
      return identifier;
  }
}

async function copyTable(
  pg: PGlite,
  tableName: string,
  drizzleTable: typeof DRIZZLE_TABLES[keyof typeof DRIZZLE_TABLES],
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;

  const columns = Object.values(getTableColumns(drizzleTable));
  const stagingName = "__dw_copy_" + tableName;

  await pg.exec(
    "CREATE TEMP TABLE " +
      quoteIdentifier(stagingName) +
      " (" +
      columns
        .map(
          (column) =>
            quoteIdentifier(column.name) +
            " " +
            stagingType(column.getSQLType()),
        )
        .join(", ") +
      ")",
  );

  try {
    const binaryCopy = await createBinaryCopyFromDrizzleTable(
      drizzleTable,
      rows as never,
    );

    const columnNames = columns
      .map((column) => quoteIdentifier(column.name))
      .join(", ");

    await pg.query(
      "COPY " +
        quoteIdentifier(stagingName) +
        " (" +
        columnNames +
        ") FROM '/dev/blob' WITH (FORMAT binary)",
      [],
      { blob: binaryCopy },
    );

    await pg.exec(
      "INSERT INTO " +
        quoteIdentifier(tableName) +
        " (" +
        columnNames +
        ") SELECT " +
        columns
          .map((column) =>
            targetExpression(column.getSQLType(), column.name),
          )
          .join(", ") +
        " FROM " +
        quoteIdentifier(stagingName),
    );
  } finally {
    await pg.exec(
      "DROP TABLE IF EXISTS " + quoteIdentifier(stagingName),
    );
  }
}

export async function restoreSqliteBackup(
  pg: PGlite,
  filePath: string,
): Promise<void> {
  const data = readSqliteBackup(filePath);

  await pg.exec("BEGIN");
  try {
    await pg.exec("SET search_path TO public");

    for (const table of BACKUP_TABLE_ORDER) {
      await pg.exec(PG_TABLE_DDL[table]);
    }

    for (const table of BACKUP_TABLES) {
      const rows = data.get(table.name) ?? [];
      const drizzleTable =
        DRIZZLE_TABLES[table.name as keyof typeof DRIZZLE_TABLES];

      if (!drizzleTable) {
        throw new Error("Missing Drizzle table for backup table: " + table.name);
      }

      await copyTable(pg, table.name, drizzleTable, rows);
    }

    for (const index of PG_INDEXES) {
      await pg.exec(index);
    }

    for (const foreignKey of PG_FOREIGN_KEYS) {
      await pg.exec(foreignKey);
    }

    await pg.exec("COMMIT");
  } catch (error) {
    await pg.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
