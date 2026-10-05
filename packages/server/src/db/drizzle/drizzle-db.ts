import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./drizzle-schema";

let pool: Pool | null = null;

export type AppDatabase = PgDatabase<any, typeof schema>;

export let db_drizzle: AppDatabase;

export function initPostgresDrizzle(): AppDatabase {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  db_drizzle = drizzlePostgres(pool, { schema, logger: true });
  return db_drizzle;
}

export function initPGliteDrizzle(pglite: PGlite): AppDatabase {
  db_drizzle = drizzlePglite({ client: pglite, schema });
  return db_drizzle;
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL pool has not been initialized");
  }
  return pool;
}
