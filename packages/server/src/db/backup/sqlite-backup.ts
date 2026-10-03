import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  BACKUP_TABLES,
  SQLITE_BACKUP_VERSION,
} from "./sqlite-backup-schema";
import { fromSqliteValue, toSqliteValue } from "./sqlite-value-converter";

const BACKUP_METADATA_TABLE = "__dw_backup";
const BACKUP_SCHEMA_ID = "dw-server-postgres-schema-v1";

export interface SqlQueryClient {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export type SqliteBackupSource = "postgres" | "pglite";

export interface SqliteBackupOptions {
  filePath: string;
  source: SqliteBackupSource;
}

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function createSqliteSchema(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(
    'CREATE TABLE "__dw_backup" ("version" INTEGER NOT NULL, "schema" TEXT NOT NULL, "created_at" TEXT NOT NULL, "source" TEXT NOT NULL);',
  );

  for (const table of BACKUP_TABLES) {
    const columns = table.columns
      .map((column) => quoteIdentifier(column.name) + " " + column.sqliteType + (column.notNull ? " NOT NULL" : ""))
      .join(", ");
    const primaryKey = ", PRIMARY KEY (" + table.primaryKey.map(quoteIdentifier).join(", ") + ")";
    const foreignKeys = table.foreignKeys
      .map(
        (key) =>
          ", FOREIGN KEY (" +
          key.columns.map(quoteIdentifier).join(", ") +
          ") REFERENCES " +
          quoteIdentifier(key.references.table) +
          " (" +
          key.references.columns.map(quoteIdentifier).join(", ") +
          ") ON DELETE " +
          (key.onDelete === "cascade" ? "CASCADE" : "NO ACTION"),
      )
      .join("");
    db.exec(
      "CREATE TABLE " +
        quoteIdentifier(table.name) +
        " (" +
        columns +
        primaryKey +
        foreignKeys +
        ");",
    );
  }

  for (const table of BACKUP_TABLES) {
    for (const index of table.indexes) {
      db.exec(
        "CREATE INDEX " +
          quoteIdentifier(index.name) +
          " ON " +
          quoteIdentifier(table.name) +
          " (" +
          index.columns.map(quoteIdentifier).join(", ") +
          ");",
      );
    }
  }
}

export async function createSqliteBackup(
  queryClient: SqlQueryClient,
  options: SqliteBackupOptions,
): Promise<void> {
  const targetPath = path.resolve(options.filePath);
  const temporaryPath = targetPath + ".tmp-" + process.pid + "-" + Date.now();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.rmSync(temporaryPath, { force: true });

  const db = new DatabaseSync(temporaryPath);
  try {
    createSqliteSchema(db);
    db.prepare(
      'INSERT INTO "__dw_backup" ("version", "schema", "created_at", "source") VALUES (?, ?, ?, ?)',
    ).run(
      SQLITE_BACKUP_VERSION,
      BACKUP_SCHEMA_ID,
      new Date().toISOString(),
      options.source,
    );

    db.exec("BEGIN");
    try {
      for (const table of BACKUP_TABLES) {
        const selectColumns = table.columns
          .map((column) => {
            const identifier = quoteIdentifier(column.name);
            return column.type === "timestamp"
              ? identifier + "::text AS " + identifier
              : identifier;
          })
          .join(", ");
        const result = await queryClient.query(
          "SELECT " + selectColumns + " FROM " + quoteIdentifier(table.name),
        );
        const columns = table.columns.map((column) => quoteIdentifier(column.name)).join(", ");
        const placeholders = table.columns.map(() => "?").join(", ");
        const insert = db.prepare(
          "INSERT INTO " +
            quoteIdentifier(table.name) +
            " (" +
            columns +
            ") VALUES (" +
            placeholders +
            ")",
        );
        try {
          for (const row of result.rows) {
            insert.run(
              ...table.columns.map((column) =>
                toSqliteValue(column.type, row[column.name]),
              ),
            );
          }
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }

  validateSqliteBackup(temporaryPath);
  fs.rmSync(targetPath, { force: true });
  fs.renameSync(temporaryPath, targetPath);
}

export function validateSqliteBackup(filePath: string): void {
  const targetPath = path.resolve(filePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error("SQLite backup not found: " + targetPath);
  }

  const db = new DatabaseSync(targetPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");

    const metadata = db.prepare(
      'SELECT version, schema FROM "__dw_backup" LIMIT 1',
    ).get() as { version: number; schema: string } | undefined;

    if (
      metadata?.version !== SQLITE_BACKUP_VERSION ||
      metadata.schema !== BACKUP_SCHEMA_ID
    ) {
      throw new Error("SQLite backup version or schema is incompatible");
    }

    for (const table of BACKUP_TABLES) {
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table.name);
      if (!exists) throw new Error("SQLite backup table is missing: " + table.name);

      const columns = db
        .prepare("PRAGMA table_info(" + quoteIdentifier(table.name) + ")")
        .all() as Array<{ name: string }>;

      for (const column of table.columns) {
        if (!columns.some((item) => item.name === column.name)) {
          throw new Error(
            "SQLite backup column is missing: " +
              table.name +
              "." +
              column.name,
          );
        }
      }

      const rows = db
        .prepare("SELECT * FROM " + quoteIdentifier(table.name))
        .all() as Record<string, unknown>[];

      for (const row of rows) {
        for (const column of table.columns) {
          fromSqliteValue(column.type, row[column.name]);
        }
      }
    }

    const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyErrors.length > 0) {
      throw new Error("SQLite backup contains invalid foreign-key references");
    }
  } finally {
    db.close();
  }
}

export function readSqliteBackup(
  filePath: string,
): Map<string, Array<Record<string, unknown>>> {
  validateSqliteBackup(filePath);
  const db = new DatabaseSync(path.resolve(filePath));
  try {
    const result = new Map<string, Array<Record<string, unknown>>>();
    for (const table of BACKUP_TABLES) {
      const rows = db
        .prepare("SELECT * FROM " + quoteIdentifier(table.name))
        .all() as Record<string, unknown>[];
      result.set(
        table.name,
        rows.map((row) => {
          const converted: Record<string, unknown> = {};
          for (const column of table.columns) {
            converted[column.name] = fromSqliteValue(
              column.type,
              row[column.name],
            );
          }
          return converted;
        }),
      );
    }
    return result;
  } finally {
    db.close();
  }
}
