import { exec, execSync } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import process from "process";
import * as yaml from "yaml";

const execAsync = promisify(exec);

// Конфигурация PostgreSQL
const CONFIG = {
  serviceName: "my-postgres",
  containerName: "my-postgres",
  image: "postgres:15",
  hostPort: 5432,
  containerPort: 5432,
  user: "postgres",
  password: "postgres",
  database: "mydb",
  volumeDir: "./data/postgres",
};

const COMPOSE_DIR = path.join(process.cwd(), "db");
const COMPOSE_FILE_EXT = path.join(COMPOSE_DIR, "docker-compose");
const COMPOSE_FILE = `${COMPOSE_FILE_EXT}.yaml`;

// ========== Вспомогательная генерация compose-файла ==========
async function generateComposeFile() {
  await fs.mkdir(COMPOSE_DIR, { recursive: true });
  const composeConfig = {
    version: "3.8",
    services: {
      [CONFIG.serviceName]: {
        image: CONFIG.image,
        container_name: CONFIG.containerName,
        restart: "unless-stopped",
        ports: [`${CONFIG.hostPort}:${CONFIG.containerPort}`],
        environment: {
          POSTGRES_USER: CONFIG.user,
          POSTGRES_PASSWORD: CONFIG.password,
          POSTGRES_DB: CONFIG.database,
        },
        volumes: [`${CONFIG.volumeDir}:/var/lib/postgresql/data`],
      },
    },
  };
  // Записываем JSON-файл с красивым форматированием
  await fs.writeFile(`${COMPOSE_FILE_EXT}.yaml`, yaml.stringify(composeConfig));
  await fs.writeFile(`${COMPOSE_FILE_EXT}.json`, JSON.stringify(composeConfig, null, 2));

  console.log(`Generated ${COMPOSE_FILE}`);
}

function generateComposeFileSync() {
  fsSync.mkdirSync(COMPOSE_DIR, { recursive: true });
  const composeConfig = {
    version: "3.8",
    services: {
      [CONFIG.serviceName]: {
        image: CONFIG.image,
        container_name: CONFIG.containerName,
        restart: "unless-stopped",
        ports: [`${CONFIG.hostPort}:${CONFIG.containerPort}`],
        environment: {
          POSTGRES_USER: CONFIG.user,
          POSTGRES_PASSWORD: CONFIG.password,
          POSTGRES_DB: CONFIG.database,
        },
        volumes: [`${CONFIG.volumeDir}:/var/lib/postgresql/data`],
      },
    },
  };
  fsSync.writeFileSync(`${COMPOSE_FILE_EXT}.yaml`, yaml.stringify(composeConfig));
  fsSync.writeFileSync(`${COMPOSE_FILE_EXT}.json`, JSON.stringify(composeConfig, null, 2));
  console.log(`Generated ${COMPOSE_FILE}`);
}

// ========== Примитивы: запуск контейнера (без ожидания) ==========
export function startContainerSync() {
  console.log("Ensuring docker-compose.json exists...");
  generateComposeFileSync();

  console.log("Starting PostgreSQL container (sync, no wait)...");
  try {
    execSync(`docker-compose -f ${COMPOSE_FILE} up -d`, { stdio: "inherit" });
    console.log("Container started.");
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }
}

export async function startContainerAsync() {
  console.log("Ensuring docker-compose.json exists...");
  await generateComposeFile();

  console.log("Starting PostgreSQL container (async, no wait)...");
  try {
    await execAsync(`docker-compose -f ${COMPOSE_FILE} up -d`);
    console.log("Container started.");
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }
}

// ========== Примитивы: ожидание готовности ==========
export function waitForDatabaseReadySync(maxRetries = 30, delayMs = 2000) {
  console.log("Waiting for database to be ready (sync)...");
  for (let i = 0; i < maxRetries; i++) {
    try {
      const stdout = execSync(`docker-compose -f ${COMPOSE_FILE} exec -T ${CONFIG.serviceName} pg_isready -U ${CONFIG.user}`, { encoding: "utf-8" });
      if (stdout.includes("accepting connections")) {
        console.log("Database is ready!");
        return;
      }
    } catch {
      // ignore
    }
    console.log(`Attempt ${i + 1}/${maxRetries}: Database not ready yet.`);
    execSync(`sleep ${delayMs / 1000}`);
  }
  throw new Error("Database did not become ready in time.");
}

export async function waitForDatabaseReadyAsync(maxRetries = 30, delayMs = 2000) {
  console.log("Waiting for database to be ready (async)...");
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { stdout } = await execAsync(`docker-compose -f ${COMPOSE_FILE} exec -T ${CONFIG.serviceName} pg_isready -U ${CONFIG.user}`);
      if (stdout.includes("accepting connections")) {
        console.log("Database is ready!");
        return;
      }
    } catch {
      // ignore
    }
    console.log(`Attempt ${i + 1}/${maxRetries}: Database not ready yet.`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Database did not become ready in time.");
}

// ========== Примитивы: запуск + ожидание (комбинированные) ==========
export function startAndWaitSync() {
  startContainerSync();
  waitForDatabaseReadySync();
}

export async function startAndWaitAsync() {
  await startContainerAsync();
  await waitForDatabaseReadyAsync();
}

// ========== Примитивы: остановка ==========
export function stopContainerSync() {
  console.log("Stopping PostgreSQL container (sync)...");
  try {
    execSync(`docker-compose -f ${COMPOSE_FILE} down`, { stdio: "inherit" });
    console.log("Container stopped.");
  } catch (error) {
    console.error("Failed to stop container:", error);
    throw error;
  }
}

export async function stopContainerAsync() {
  console.log("Stopping PostgreSQL container (async)...");
  try {
    await execAsync(`docker-compose -f ${COMPOSE_FILE} down`);
    console.log("Container stopped.");
  } catch (error) {
    console.error("Failed to stop container:", error);
    throw error;
  }
}

// ========== Регистрация обработчиков завершения ==========
function registerShutdownHandlers() {
  process.on("exit", (code) => {
    try {
      stopContainerSync();
    } catch (e) {
      console.error("Error stopping container on exit:", e);
    }
  });

  const handleSignal = (signal: string) => {
    console.log(`Received ${signal}, stopping container...`);
    try {
      stopContainerSync();
    } catch (e) {
      console.error(`Error stopping container on ${signal}:`, e);
    }
    process.exit(0);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

// ========== Функции высокого уровня ==========

/**
 * Синхронно запускает контейнер, выполняет колбэк, затем синхронно останавливает.
 * Гарантирует остановку даже при ошибке в колбэке.
 */
export function runWithCallbackSync<T>(callback: () => T): T {
  startAndWaitSync();
  registerShutdownHandlers();
  try {
    return callback();
  } finally {
    stopContainerSync();
  }
}

/**
 * Асинхронно запускает контейнер, ожидает переданный промис, затем асинхронно останавливает.
 * Гарантирует остановку даже при ошибке.
 */
export async function runWithPromiseAsync<T>(promise: Promise<T>): Promise<T> {
  await startAndWaitAsync();
  registerShutdownHandlers();
  try {
    return await promise;
  } finally {
    await stopContainerAsync().catch((e) => console.error("Error stopping container:", e));
  }
}

/**
 * Синхронно запускает контейнер, регистрирует обработчики для автоматической остановки при выходе,
 * и сразу возвращает управление. Подходит для случаев, когда приложение продолжает работу,
 * а контейнер должен жить до завершения процесса.
 */
export function runWithAppLifecycleSync(): void {
  startAndWaitSync();
  registerShutdownHandlers();
  console.log("Database container is running (sync). It will be stopped automatically on process exit.");
}

/**
 * Асинхронно запускает контейнер, регистрирует обработчики для автоматической остановки при выходе,
 * и сразу возвращает управление (после готовности БД). Не содержит бесконечного ожидания.
 */
export async function runWithAppLifecycleAsync(): Promise<void> {
  await startAndWaitAsync();
  registerShutdownHandlers();
  console.log("Database container is running (async). It will be stopped automatically on process exit.");
}

// ========== Обработка команд из командной строки ==========
if (require.main === module) {
  const command = process.argv[2];
  if (command === "up") {
    startAndWaitAsync()
      .then(() => {
        console.log("Database container is now running. You can stop it with `npm run docker:down`");
        process.exit(0);
      })
      .catch(console.error);
  } else if (command === "down") {
    stopContainerSync();
  } else {
    // По умолчанию используем runWithAppLifecycleAsync (не блокирует)
    runWithAppLifecycleAsync().catch(console.error);
  }
}
