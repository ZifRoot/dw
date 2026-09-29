Сканирование завершено: прошёлся по всему монорепозиторию (server, client, shared, генераторы, конфиги, git), проверил компиляцию. Ниже — найденные проблемы и решения.

# Отчёт по проекту deepseek-w

## 🔴 Критичные баги

**1. `POST /api/embeddings` всегда возвращает `received: {}`**
В [embeddings.controller.ts:158](packages/server/src/controllers/embeddings.controller.ts:158) `count` — это `Promise<number>`, который не авертится перед `c.json(...)`. Promise сериализуется в JSON как пустой объект.
*Решение:* `const count = await [...].reduce(...)` (или `Promise.all` + сумма).

**2. Клиент не проходит проверку типов — мёртвые файлы с несуществующими импортами**
`tsc` падает на:
- [CanvasEngine.ts](packages/client/src/core/CanvasEngine.ts:5) — импорты `./renderer/CanvasRenderer`, `./physics/EmbeddingEngine`, `./Point` (файлов нет); сам `CanvasEngine` никем не используется (приложение использует `SvgEngine`);
- [DragHandler.ts:2-3](packages/client/src/core/interaction/DragHandler.ts:2) — `../Point`, `../renderer/CanvasRenderer` (нет);
- [ModelData.ts:2-3](packages/client/src/core/ModelData.ts:2) — `./Pair`, `./Point` (нет);
- [PointsSceneTester.ts:4](packages/client/src/core/PointsSceneTester.ts:4) — `EdgeModel` не экспортируется из `./models/Edge` (он в соседнем файле `EdgeModel.ts`).
Плюс локальный TypeScript клиента `^5.0.0` не понимает конфиг: `ignoreDeprecations: "6.0"` (TS5103) и `lib: ES2025` (TS6046) — т.е. type-check клиента сломан полностью, а vite не видит это, потому что не запускает tsc.
*Решение:* удалить/перенести мёртвые файлы (`CanvasEngine`, `DragHandler`, `ModelData` — если они не нужны), починить импорт в `PointsSceneTester`, привести `typescript` клиента к версии из корня (6.x) или убрать `ES2025`/`ignoreDeprecations`.

**3. `fetch_page_all` падает на пустой странице**
[deepseek.ts:11](packages/server/src/deepseek.ts:11) — `chat_sessions[0].updated_at` бросит `TypeError`, если API вернёт пустой список. Переменная `ud0` при этом вообще не используется.
*Решение:* `chat_sessions[0]?.updated_at` + удалить мёртвый `ud0`.

**4. Embedder: бесконечный цикл и краш на неудавшейся задаче**
В [Embedder.ts](packages/server/src/Embedder.ts):
- `workEmbedding` (строка ~187) крутится `while (this.tasks.size > 0)` и опрашивает только `status=completed`. Если задача на стороне сервиса упала/зависла — цикл будет крутиться **вечно**. Нет таймаута и обработки статуса `failed`.
- `apiTask.result!` (строка ~233) — если у задачи `result == null` (ошибка), `null` всё равно засчитывается как «выполнена» (`t.result !== undefined`), а дальше `t.result!.slice()` в `computeAggregatedEmbedding` — краш. При этом `aggregateAndSaveEmbedding` вызывается fire-and-forget → unhandled rejection.
*Решение:* опрашивать и `failed` статус, удалять такие задачи (с логированием ошибки), добавить таймаут ожидания, `if (!apiTask.result) { ...обработка ошибки... }`, авертить запись в БД.

**5. `db-manager.ts` не работает на Windows (а вы на Windows)**
- [db-manager.ts:158](packages/server/src/db/db-manager.ts:158) — `execSync("sleep 2")`: в `cmd.exe` команды `sleep` нет → `waitForDatabaseReadySync` (путь `docker:up`) падает сразу. В асинхронной версии уже `setTimeout` — правильно.
- Несогласованность: sync-ветки используют `docker compose` (v2), асинхронные — `docker-compose` (v1, может быть не установлен).
- Мёртвый код: `throw new Error(...)` после `return false` (строки ~166, ~180) — никогда не выполнится.
*Решение:* заменить `sleep` на `Atomics.wait`/`setTimeout`-аналог (или единый async-путь), унифицировать на `docker compose`, убрать недостижимые `throw`.

**6. Debug Fullstack сломан: разные порты инспектора**
Скрипт `debug` сервера: `node --inspect=9229` ([package.json:9](packages/server/package.json:9)), а [.vscode/launch.json:20](.vscode/launch.json:20) attach'ится на `port: 5858`. Дебагер никогда не подключится.
*Решение:* привести к одному порту (9229 в обоих местах).

**7. `.vscode/launch.json` — невалидный JSON**
[launch.json:52](.vscode/launch.json:52) — trailing comma после `"webRoot": ...` в блоке `webServer`. Часть инструментов его не распарсит.

## 🟠 Архитектура

**8. Распространение shared-кода через Windows-джанкшены — хрупко**
`packages/shared` **не является npm-workspace** (в нём нет `package.json`), а `@utils/*` в server/client резолвится в `src/shared` — папки, созданные `link-shared.cmd` (`mklink /J`) и **отслеживаемые .gitignore** ([.gitignore:156-157](.gitignore:156)). Свежий `git clone` на другом ПК не соберётся: файлов не будет, скрипт ручной и Windows-only. Сейчас три одинаковые копии utils живут в репо/на диске.
*Решение:* сделать `packages/shared` нормальным пакетом (`package.json` с именем, напр. `@dew/shared`, `main`/`types`), заменить `@utils/*` на импорт пакета (tsconfig paths + vite alias уже на это готовы: в vite есть `alias: { "@shared": "../shared/src" }`), удалить джанкшены и gitignore-строки.

**9. Три источника схемы БД**
[drizzle-schema.ts](packages/server/src/db/drizzle/drizzle-schema.ts) + [infra/tables.sql](packages/server/src/db/infra/tables.sql) + `infra/views/*.sql` + миграции в `drizzle/`. Схема уже расходится (напр. в `drizzle-schema.ts` у `model_name` стоит `varchar(80)`, а комментарий говорит «50 символов»).
*Решение:* drizzle — единственный источник правды; SQL в `infra/` удалить или генерировать из схемы.

**10. API без аутентификации + бинд на `0.0.0.0`**
[program.ts:31](packages/server/src/program.ts:31). Любой на сети может читать все сессии, файлы и embeddings, а в БД лежат живые креденшелы DeepSeek (`user.credentials`).
*Решение:* минимум — бинд на `127.0.0.1`; лучше — токен-аутентификация на middleware.

**11. Express + Hono одновременно**
Express нужен фактически только для `express.static`. Можно перейти на чистый Hono (`@hono/node-server` уже в зависимостях) и выкинуть `express`, `@types/express`, `swagger-ui-express` (+ types), `@scalar/hono-api-reference` (используется закомментированный код) — мёртвые зависимости.

**12. N+1 запросы** в [documents.controller.ts](packages/server/src/controllers/documents.controller.ts): `buildFullText`, `buildFragmentsList`, `fragmentsList` (и последовательно, concurrency=1). На больших сессиях это десятки/сотни запросов.
*Решение:* один запрос `SELECT ... WHERE session_id = ? ORDER BY message_id, fragment_order` и группировка в памяти.

## 🟡 Конфигурация и гигиена

13. **Фантомная зависимость `yaml`** — [db-manager.ts:7](packages/server/src/db/db-manager.ts:7) импортирует `yaml`, а в [package.json](packages/server/package.json) её нет (работает только благодаря хоистингу).
14. **Сломанные npm-скрипты** в [package.json](package.json):
    - `docker:up/down` — путь `src/db/db-manager.ts` от корня не существует (правильно `packages/server/src/...`);
    - `ddd` — папки `ddd/` нет;
    - `clean` — `rm -rf` не работает в Windows cmd;
    - `generate:dew/embedder` — `cd generators\dew` (обратные слеши, Windows-only).
15. **`updateatSchema` объявлена дважды** с разными формами — [base.controller.ts:16](packages/server/src/controllers/base.controller.ts:16) (сломанная: поле `id: z.date()` при имени параметра `updateat`) и [documents.controller.ts:18](packages/server/src/controllers/documents.controller.ts:18) (бессмысленная: пример `"session-123"` для даты). Обе не используются. Удалить; нужное уже есть в `embQuerySchema`.
16. **`/document/{id}/parse`** возвращает пустой `{}` (mdforge закомментирован) — мёртвый эндпоинт: либо доделать, либо убрать из API.
17. **`dtoToEmbeddingCreate` выбрасывает `createdAt`** из DTO ([embeddings.controller.ts:50](packages/server/src/controllers/embeddings.controller.ts:50)), хотя схема требует его от клиента — противоречие контракта.
18. **`drizzle` с `logger: true`** в проде ([drizzle-db.ts:12](packages/server/src/db/drizzle/drizzle-db.ts:12)) — логирует весь SQL (шум + потенциальные данные в логах). Включать по флаге env.
19. **Хардкод**: `basePath: "http://localhost:8000"` в Embedder и DSN в [drizzle.config.ts](packages/server/drizzle.config.ts) — вынести в env.
20. **Мусор в репо/на диске**: `xxx/` (черновики) закоммичена в git; `example/` — локальный мусор (в т.ч. temp-файл `getEmbeddings.~ts`); `openapi.json` в корне — артефакт генерации. README — шаблон GitLab.
21. **Немного мёртвого кода**: `let map = new Map()` в [program.ts:73](packages/server/src/program.ts:73), `let embs = await this.db.embeddings.getAll()` в [DataManager.ts:128](packages/client/src/core/data/DataManager.ts:128) (и `noUnusedLocals: true` в клиенте это ловит), закомментированные блоки в `index.ts`.
22. **В клиенте в проде** живут `PointsSceneTester` (verbose=true) и постоянный `setInterval(..., 1000)` ([index.ts:91](packages/client/src/index.ts:91)) — тестовый код в основном приложении.
23. **Нет тестов и линтера** (eslint/prettier отсутствуют) — при таком объёме ручного кода это главный источник регрессий.

---

## Что предлагаю починить первыми (по влиянию/усилию)

| # | Фикс | Усилия |
|---|------|--------|
| 1 | `await count` в embeddings POST | 1 строка |
| 6+7 | Порт 9229 в launch.json + убрать trailing comma | 2 строки |
| 3 | Опциональная цепочка в `fetch_page_all` | 1 строка |
| 5 | `sleep` → асинхронное ожидание, `docker compose` | ~15 строк |
| 4 | Обработка `failed`/`null` result + таймаут в Embedder | ~30 строк |
| 2 | Удалить мёртвые файлы клиента + согласовать TS | удаление + конфиг |
| 8 | `packages/shared` → нормальный workspace-пакет | ~1 час |

Могу прямо сейчас внести правки из таблицы (пункты 1, 3, 5, 6, 7 — быстрые и безрисковые). Скажите, что применять — и я начну с быстрых фиксов, потом перейду к Embedder и shared-пакету.