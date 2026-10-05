import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { createSqliteBackup, validateSqliteBackup } from "./backup/sqlite-backup";
import { restoreSqliteBackup } from "./backup/pglite-restore";
import { DbManager } from "./db-manager";
import { getPostgresPool, initPostgresDrizzle } from "./drizzle/drizzle-db";

export type DatabaseBackend = "pglite" | "postgres";

const DEFAULT_BACKUP_PATH = "./data/backup.sqlite";

export interface DatabaseRuntime {
  backend: DatabaseBackend;
  pglite: PGlite | null;
}

let runtime: DatabaseRuntime | null = null;

export function getSqliteBackupPath(): string {
  return process.env.SQLITE_BACKUP_PATH || DEFAULT_BACKUP_PATH;
}

async function createPGliteFromBackup(
  backupPath: string,
): Promise<PGlite> {
  const pg = new PGlite();
  try {
    validateSqliteBackup(backupPath);
    await restoreSqliteBackup(pg, backupPath);
    return pg;
  } catch (error) {
    await pg.close().catch(() => undefined);
    throw error;
  }
}

async function bootstrapPGliteFromPostgres(
  backupPath: string,
): Promise<PGlite | null> {
  try {
    await createSqliteBackup(
      {
        query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) =>
          getPostgresPool().query(text, values),
      },
      { filePath: backupPath, source: "postgres" },
    );
    return await createPGliteFromBackup(backupPath);
  } catch (error) {
    console.error("PGlite bootstrap from PostgreSQL failed:", error);
    return null;
  }
}

export async function initializeDatabaseRuntime(): Promise<DatabaseRuntime> {
  if (runtime) return runtime;

  const backupPath = getSqliteBackupPath();

  if (fs.existsSync(backupPath)) {
    try {
      const pglite = await createPGliteFromBackup(backupPath);
      runtime = { backend: "pglite", pglite };
      return runtime;
    } catch (error) {
      console.warn("SQLite backup restore failed; falling back to PostgreSQL:", error);
    }
  }

  if (!(await DbManager.startAndWaitAsync())) {
    throw new Error("Failed to initialize PostgreSQL fallback");
  }

  initPostgresDrizzle();
  const pglite = await bootstrapPGliteFromPostgres(backupPath);
  if (pglite) {
    runtime = { backend: "pglite", pglite };
    return runtime;
  }

  runtime = { backend: "postgres", pglite: null };
  return runtime;
}

export function getDatabaseRuntime(): DatabaseRuntime {
  if (!runtime) throw new Error("Database runtime has not been initialized");
  return runtime;
}

export async function createDatabaseBackup(): Promise<void> {
  const current = getDatabaseRuntime();
  const backupPath = getSqliteBackupPath();

  if (current.backend === "pglite" && current.pglite) {
    await createSqliteBackup(
      {
        query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) =>
          current.pglite!.query<T>(text, values),
      },
      { filePath: backupPath, source: "pglite" },
    );
    return;
  }

  await createSqliteBackup(
    {
      query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) =>
        getPostgresPool().query(text, values),
    },
    { filePath: backupPath, source: "postgres" },
  );
}

export async function closeDatabaseRuntime(): Promise<void> {
  if (!runtime) return;
  if (runtime.pglite) await runtime.pglite.close();
  runtime = null;
}
