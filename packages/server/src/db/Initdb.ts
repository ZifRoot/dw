import "dotenv/config";
import { DrizzleRepository } from "./DrizzleRepository";
import { IRepository } from "./IRepository";
import {
  getDatabaseRuntime,
  initializeDatabaseRuntime,
} from "./database-runtime";
import {
  initPGliteDrizzle,
  initPostgresDrizzle,
} from "./drizzle/drizzle-db";

export function InitdrizzleDb() {
  const current = getDatabaseRuntime();
  if (current.backend === "pglite" && current.pglite) {
    return new DrizzleRepository(initPGliteDrizzle(current.pglite));
  }

  return new DrizzleRepository(initPostgresDrizzle());
}

export function InitDb(): IRepository {
  throw new Error("Synchronous database initialization is no longer supported");
}

export function InitDbFast(): IRepository {
  throw new Error("Fast database initialization is no longer supported");
}

export async function InitDbAsync(): Promise<IRepository> {
  await initializeDatabaseRuntime();
  return InitdrizzleDb();
}
