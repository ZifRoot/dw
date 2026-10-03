import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { AnyPgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./drizzle-schema";

let pool: Pool | null = null;

export let db_drizzle: AnyPgDatabase;

export function initPostgresDrizzle(): AnyPgDatabase {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  db_drizzle = drizzlePostgres(pool, { schema, logger: true });
  return db_drizzle;
}

export function initPGliteDrizzle(pglite: PGlite): AnyPgDatabase {
  db_drizzle = drizzlePglite({ client: pglite, schema });
  return db_drizzle;
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL pool has not been initialized");
  }
  return pool;
}
