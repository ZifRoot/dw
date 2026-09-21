// scripts/sync-shared.mjs
import { rmSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---- Настройки (правьте тут) ----
const SHARED_SRC = resolve(ROOT, "packages/shared/src");

const TARGETS = [
  resolve(ROOT, "packages/server/src/shared"),
  resolve(ROOT, "packages/client/src/shared"),
];
// ---------------------------------

if (!existsSync(SHARED_SRC)) {
  console.error(`[sync] Не найдено: ${SHARED_SRC}`);
  process.exit(1);
}

for (const target of TARGETS) {
  const pkgDir = resolve(target, "..", ".."); // packages/<name>
  if (!existsSync(pkgDir)) {
    console.log(`[sync] Пропуск (нет пакета): ${pkgDir}`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(SHARED_SRC, target, { recursive: true });
  console.log(`[sync] ${SHARED_SRC} → ${target}`);
}

console.log("[sync] Готово.");
