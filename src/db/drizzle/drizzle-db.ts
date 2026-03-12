import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./drizzle-schema"; // путь к файлу, где лежит chatSessionsTable
// 1. Создаем обычный пул соединений pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
// 2. Инициализируем Drizzle
// Передаем схему в опциях, чтобы работал автокомплит для связей (если будут)

export const db_drizzle = drizzle(pool, { schema });
