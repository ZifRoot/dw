import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Путь к файлу со схемой (где лежит твой pgTable)
  schema: "./src/db/drizzle/drizzle-schema.ts",
  
  // Куда складывать SQL-файлы миграций
  out: "./drizzle",
  
  // Драйвер для PostgreSQL
  dialect: "postgresql",
  
  // Учетные данные БД (лучше брать из .env)
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  
  // Помогает избежать случайного удаления таблиц
  strict: true,
  
  // Выводит логи всех операций в консоль
  verbose: true,
});
