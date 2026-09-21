# PROJECT_CONTEXT.md — карта навигации для AI-агентов

> Актуальность: проверено по коду на 2026-09-12. Если поведение кода расходится с этим документом — **код правда**, обновлять этот файл.
> Назначение: дать агенту мгновенную модель проекта без повторного полного сканирования. Здесь только факты из кода; неясное помечено `[Требует уточнения у разработчика]`.

---

## 1. Суть и стек (reverse-engineered)

**Что делает система (по коду, не по догадкам):**
- **Сервер** синхронизирует чаты/файлы с веб-API DeepSeek (`chat.deepseek.com/api/v0`) по креденшелам пользователей (хранятся в БД: `user.credentials` = `{authorization, cookie}`) и складывает их в PostgreSQL.
- **Сервер** управляет «эмбеддинг-сервисом» — **внешним** сервисом на `http://localhost:8000` (отдельный проект, в этом репозитории его кода НЕТ): создаёт на нём задачи эмбеддинга по фрагментам ответов, собирает результаты, агрегирует (взвешенное среднее по длине контента) и сохраняет вектор на сессию×модель.
- **Клиент** — 3D/2D-визуализация сессий как графа точек/рёбер (кастомный SVG-движок на D3, не React-рендер сцены): физика (репульсия, граф, z-демпфирование), drag, панели на React. Состояние кэшируется в IndexedDB, синхронизируется с API сервера.

**Точный стек (из `package.json`/`tsconfig`):**

| Слой | Технологии и версии |
|---|---|
| Корень | npm workspaces (`packages/*`), `typescript@^6.0.3`, `tsx`, `dotenv`, `@openapitools/openapi-generator-cli@^2.7.0` (CLI-версия в `openapitools.json` — **7.22.0**) |
| Server | `express@^5.2.1` + `hono@^4.12.19` + `@hono/zod-openapi@^1.4.0` + `zod@^4.4.3`, `drizzle-orm@^0.45.2` + `drizzle-kit@^0.31.10` + `pg@^8.21.0`, сборка: `tsc` + `tsc-alias`, рантайм-дебаг: `ts-node` + `tsconfig-paths`. **Фантомная зависимость `yaml`** (используется в **db-manager.ts**, в `package.json` не заявлена) |
| Client | `vite@^4` + `react@^18.2` + `d3@^7.9` + `sass`, локальный `typescript@^5.0.0` (**конфликтует с его же tsconfig**, см. грабли) |
| БД | PostgreSQL 15 в docker (host-порт **6000** → контейнер 5432), данные: docker-volume `./data/postgres` (относительно cwd) |
| Внешние сервисы | DeepSeek web API; Embedding Service на `:8000` |

**Порты:** `8081` — сервер (env `PORT`), `3000` — vite dev (strictPort, прокси `/api`→`8081`), `4173` — vite preview, `8000` — embedding-сервис, `6000` — postgres, `9229` — `node --inspect` (debug-скрипт сервера).

**Env:** `DATABASE_URL`, `DB_USER/DB_PASSWORD/DB_NAME/DB_PORT` — генерируются **db-manager.ts** в `.env` (если его нет); `PORT`.

---

## 2. Архитектура монорепозитория (как это работает СЕЙЧАС)

```
deepseek-w/
├─ packages/
│  ├─ server/        # Express+Hono API + Drizzle/Postgres + синхронизация DeepSeek + Embedder-оркестратор
│  ├─ client/        # Vite+React+D3 визуализация, IndexedDB-кэш
│  └─ shared/        # ТОЛЬКО src/utils/* — ОДНА canonical-копия утилит (НО не npm-пакет!)
├─ generators/
│  ├─ dew/           # генерация API-клиента СЕРВЕРА (spec "API Documentation") → packages/client/src/clients/dew/{fetch,axios}
│  └─ embedder/      # генерация клиента ЭМБЕДДИНГ-СЕРВИСА (spec "Embedding Service" 2.0.0) → packages/server/src/clients/embedder/{axios,fetch,node}
├─ .vscode/          # launch.json (compounds Debug/Release Fullstack) + tasks.json
├─ link-shared.cmd   # Windows-джанкшены packages/{server,client}/src/shared → packages/shared/src
└─ xxx/, example/    # черновики/мусор (xxx/ — в git!, example/ — gitignored)
```

**Путь имён (alias) — критично для сборки:**
- Server `tsconfig.base.json`: `@embedder`→`src/clients/embedder/axios`, `@utils/*`→`src/shared/utils/*`, `@models/*`→`src/db/models/*`, `@shared/*`→`../shared/src/*`. Release-сборка: `tsc -p tsconfig.release.json && tsc-alias` (tsc сам alias'ы в JS не переписывает — **tsc-alias обязателен**).
- Client `tsconfig.base.json`: `@utils/*`→`src/shared/utils/*`, `@clients/*`→`src/clients/*`; в рантайме резолвит `vite-tsconfig-paths`.
- **НОВЫЙ alias надо прописывать во всех трёх местах:** tsconfig (server/client) + tsc-alias покрывает server автоматически, vite-tsconfig-paths — client автоматически; но если добавляется новый пакет — см. грабли по shared.

### ⚠️ Грабли и «костыли» (знать ОБЯЗАТЕЛЬНО)

1. **`packages/shared` — НЕ npm-пакет** (нет `package.json`), но root `workspaces: ["packages/*"]` его перечисляет. В server/client он доступен через **Windows-джанкшены** `packages/{server,client}/src/shared` → `packages/shared/src`, создаваемые **`link-shared.cmd`** (`mklink /J`). Эти папки **в .gitignore** ([.gitignore:156-157](.gitignore)). **Свежий clone без запуска `link-shared.cmd` НЕ СОБЁРЁТСЯ** (пропадут `@utils/*`). Джанкшен — живая ссылка: новые файлы в `packages/shared/src` видны сразу.
2. **Смесь Express + Hono**: Express — только как обёртка (`express.json()`, `express.static`, слушатель); API на Hono (`OpenAPIHono`) монтируется через `getRequestListener(honoApp.fetch)` на префикс `/api` (**controllers/index.ts**). Swagger UI — `/api/`, spec — `/api/openapi.json`. Статика: `path.join(process.cwd(), "..", "client", "dist")` → `packages/client/dist` (только в release-режиме).
3. **db-manager.ts (Windows-грабли)**: sync-путь использует `execSync("sleep N")` — **в cmd.exe нет `sleep`** → `docker:up` (root-скрипт) падает; асинхронный путь — правильный (`setTimeout`). Sync-ветки зовут `docker compose` (v2), async — `docker-compose` (v1) — **несогласованно**. После `return false` стоит недостижимый `throw`. Сервер при старте сам поднимает postgres (**Initdb.ts** → `DbManager.startAndWaitAsync()`), если контейнер не готов; при неуспехе `InitDb*()` возвращают `null!` (в **program.ts** есть проверки `if (!this.repository)`).
4. **Генераторы**: `generators/*/download.cmd` скачивает spec из живого сервиса (`curl`), `generate.cmd` гоняет `openapi-generator-cli batch`. **БАГ:** `generators/embedder/download.cmd` берёт spec с `http://localhost:8081/api/openapi.json` — это spec **DEW-сервера**, а не embedding-сервиса `:8000`. Повторный запуск **перезапишет** `generators/embedder/specs/openapi.json` чужим API. Правильный URL docs embedding-сервиса — `[Требует уточнения у разработчика]`.
5. **Client type-check сломан**: локальный `typescript@^5.0.0` не принимает `ignoreDeprecations: "6.0"` (TS5103) и `lib: ES2025` (TS6046) из **tsconfig.base.json**. Корневой TS6 гонит конфиг, но падает на мёртвых файлах (TS2307) и `noUnusedLocals` (TS6133). Vite не запускает tsc — сборка проходит, **tsc — нет**.
6. **API без аутентификации**, бинд на `0.0.0.0` (**program.ts**). В БД лежат живые креденшелы DeepSeek — не логировать и не отдавать наружу.
7. **Client ведёт свой `package-lock.json`** внутри `packages/client/` при наличии корневых workspaces — дублирование локов, источник рассинхрона.
8. Тестов, eslint/prettier — **нет вовсе**.
9. `.vscode/launch.json`: trailing comma (невалидный JSON) и attach-порт **5858** против фактического `--inspect=9229` в `packages/server/package.json` — **Debug Fullstack сейчас не работает**.
10. Root `package.json`: сломанные/Windows-only скрипты — `docker:up/down` (неверный путь `src/db/db-manager.ts` от корня), `ddd` (папки `ddd/` нет), `clean` (`rm -rf` — не работает в cmd), `generate:dew/embedder` (`cd generators\dew` — только Windows).

### Известные баги (по состоянию на 2026-09-12, не исправлены)

- **POST /api/embeddings** всегда отдаёт `received: {}` — Promise в `count` не авертится (**embeddings.controller.ts**).
- **`fetch_page_all`** падает на пустой странице: `chat_sessions[0].updated_at` (**deepseek.ts**).
- **Embedder**: нет обработки `failed`/`null result` задач → возможный бесконечный цикл `workEmbedding` и краш `t.result!.slice()`; запись в БД fire-and-forget (**Embedder.ts**).
- **`/document/{id}/parse`** — мёртвый эндпоинт, возвращает `{}` (mdforge закомментирован).
- `dtoToEmbeddingCreate` выбрасывает `createdAt` из DTO (ставит `null` → `new Date()` в модели).
- `drizzle` с `logger: true` в проде — логирует весь SQL (**drizzle-db.ts**).

---

## 3. Ключевые потоки данных

### 3.1 Старт сервера (поднимает и БД)
`**index.ts**` → `**program.ts**::Program.start()` → `**Initdb.ts**::InitDbAsync()` → `**db-manager.ts**` (если postgres не отвечает: генерирует `.env` + `postgres_db/docker-compose.yaml` (postgres:15, порт 6000) → `docker compose up -d` → ожидание `pg_isready` в цикле) → `**drizzle-db.ts**` (pg `Pool` по `DATABASE_URL`) → `**DrizzleRepository.ts**`. Далее: `new Embedder(repo)` → Express-приложение + `**controllers/index.ts**::createExpressApp` (Hono на `/api`, Swagger на `/api/`) → `express.static(../client/dist)` → `listen(8081, 0.0.0.0)`.

### 3.2 Синхронизация с DeepSeek (`POST /api/actions/update`)
`**action.controller.ts**` → `**program.ts**::Update()` → `ExecUsers()` (каждый `user` из БД):
1. `**deepseek.ts**::fetch_page` (или `fetch_page_all` — пагинация `chat_session/fetch_page` по `lte_cursor.updated_at`; throttling `@CreateThrottle(100,300)` на экземпляр, `@ThrottledMethod GET`);
2. diff сессий по `updated_at` (разница > 1s ⇒ устарела) → `user_1()` → `deepseek.history_messages(session.id, session.version)` → `**DrizzleRepository.ts**::createMessagesBizData` — **одна транзакция**: upsert сессии → сообщений (PK `session_id+message_id`) → файлов + связей `message_files` → фрагментов (PK `session+message+fragment_order`);
3. `FilesUser()` — файлы с `content IS NULL`: `deepseek.file` (`file/preview` → download) → `MessageFile` (бинарь → hex-строка, колонка `bytea` через customType в `**types.ts**`) → `createManyFiles` (upsert по `files.id`).

Контракты моделей: `**resp.ts**` (форматы API DeepSeek) → классы в `**db/models/**` (ChatSessions/ChatMessage/MessageFile/MessageFragment/User/Embedding + `*Create`) → интерфейс `**IRepository.ts**` (единственная точка доступа к БД; у всех `create*` есть опц. параметр `tx`).

### 3.3 Эмбеддинги (`POST /api/actions/update-embedding`)
`**action.controller.ts**` → `**program.ts**::UpdateEmbedding()` → `**Embedder.ts**::Update()`:
1. `getAvailableModelNames()` — `ModelsApi.getModelsModelsGet()` (embedding-сервис `:8000`, клиент из `src/clients/embedder/axios` = alias `@embedder`);
2. `CreateTasks()` — для каждого user→session: missing-модели = `available − existing(БД) − pending(внутр. карта)`; каждое missing расширяется в задачи **по каждому фрагменту `type === "RESPONSE"`** (`findAllFragments`) → `createTaskEmbeddingsPost({model_name, text})`;
3. `workEmbedding()` — цикл: `listTasksEmbeddingsGet("completed")` → `workTask` → `getTask + deleteTask` (удаление remote-задачи!) → когда ВСЕ задачи сессии завершены → `computeAggregatedEmbedding` (взвешенное среднее: `sumA/mult/div` из `**vector.ts**`) → `repository.createEmbedding(sessionId, {model_name, dimension, embedding, processing_time_ms})` (upsert, PK `session+model_name+created_at`).
4. Результат отдаётся клиенту: `GET /api/embeddings/session/{id}`, `GET /api/embeddings/query?updateat&modelname` (**embeddings.controller.ts**); push в БД извне — `POST /api/embeddings/`.

### 3.4 Клиент: загрузка и визуализация
`**index.ts**` (bootstrap): `AppMediator` (event-bus) + `SvgEngine` (рендер) + `PointsScene`/`EdgesScene` + `AnimationEngine` + физика (`RepulsionEngine`, `GraphEngine`, `ZDampingEngine`) + `PointsTransformer` + `ModelManager` (тик каждые 1s через `setInterval` → событие `MODEL_MANAGER_STEP`) + `PointsSceneTester` (verbose, в проде!) + React-панели (`**ui/Panels/**`).
Данные: `**DataManager.ts**` — `reloadTablesSingle()` (guarded `@SingleExecution`): локальный кэш из IndexedDB (`CanvasPositionsDB`, `PointTable`/`EmbeddingTable`, модули `**data/IndexDb/**`, `**data/tables/**`) → `GET /api/documents` (клиент из `src/clients/dew/fetch` = `@clients/dew`) → `GET /api/embeddings/query?updateat=2000-02-01` → дифф по датам → запись в IndexedDB → события `POINTS_TABLE`/`EMBEDDINGS_TABLE` на медиатор. Дальше `ModelManager`/`PointsTransformer` превращают таблицы в точки сценария [точные алгоритмы (PCA/кластеризация/паттерны) не разбирать без чтения **ModelManager.ts**, **PointsTransformer.ts**, **ActiveDimensionsBuilder.ts**, **PatternMatcher.ts** — `[Требует уточнения у разработчика]`].

### 3.5 Миграции БД
Schema of record: `**drizzle-schema.ts**` → `drizzle-kit generate` (скрипты `db:generate/migrate/push/studio`, конфига **`drizzle.config.ts`**, DSN захардкожен: `postgres:postgres@localhost:6000/mydb`). Миграции: `packages/server/drizzle/` (0000–0006). **ВТОРОЙ (дублирующий) источник схемы:** `src/db/infra/tables.sql` + `src/db/infra/views/*.sql` + представления, задекларированные в `drizzle-schema.ts` (`pgView`) — риск дрейфа, править только drizzle-схему.

---

## 4. Карта «горячих точек» (Hotspots)

| Файл | За что отвечает | Риск правок |
|---|---|---|
| `packages/server/src/Embedder.ts` | Весь конвейер эмбеддингов: задачи → polling → агрегация → БД. Внутренние `tasks`/`sessionTaskMap` — **не переживают рестарт** (процесса) | Высокий: нет обработки failed/timeout; `result!` |
| `packages/server/src/program.ts` | Оркестрация: `start()`, `Update()`, `ExecUser(s)`, `FilesUser` — вся логика синхронизации DeepSeek | Высокий: обещания `@LogSafe/@Safe/@SingleExecution` глотают ошибки |
| `packages/server/src/db/DrizzleRepository.ts` | Единственная реализация `IRepository`; все upsert'ы (`onConflictDoUpdate` с конкретными targets) и транзакции | Высокий: нарушить target/cols = сломать идемпотентность |
| `packages/server/src/db/db-manager.ts` | Lifecycle postgres-docker + генерация `.env`/compose | Средний: Windows-специфика, sync/async дубли |
| `packages/server/src/deepseek.ts` | HTTP-клиент DeepSeek (заголовки-«браузерные», credentials, throttling) | Средний: API внешний, менять осторожно |
| `packages/server/src/controllers/*.ts` | REST-контракт: documents / embeddings / actions (+ OpenAPI-схемы) | Средний: схемы попадают в generated-клиенты |
| `packages/client/src/core/AppMediator.ts` | Единый event-bus и «глобальное состояние» клиента (ключи-константы, typed события) | Высокий: все подсистемы подписаны на него |
| `packages/client/src/core/Engines/SvgEngine.ts` + `Scene/PointsScene.ts`, `Scene/EdgesScene.ts` | Реальный рендер сцены (SVG/D3) | Высокий: перерисовка/перформанс |
| `packages/client/src/core/data/DataManager.ts` | Синхронизация сервер↔IndexedDB, `lowDate=2000` — всегда «полная» выборка embeddings | Средний |
| `packages/shared/src/utils/*` | 9 утилит (array-extensions, data/date-utils, logger, single-runner, throttler(+decorators), uuid, vector) — **3 копии на диске (1 canonical)** | Высокий: правки должны идти в `packages/shared`, джанкшены подхватят |

### 🚫 Мёртвый/призрачный код (НЕ читать как рабочие, НЕ «чинить» вслепую)
- `packages/client/src/core/CanvasEngine.ts` — импорты несуществующих `./renderer/CanvasRenderer`, `./physics/EmbeddingEngine`, `./Point`; никем не используется (реальный движок — `Engines/SvgEngine.ts`).
- `packages/client/src/core/interaction/DragHandler.ts` — импорты `../Point`, `../renderer/CanvasRenderer` (нет); жив только через мёртвый CanvasEngine.
- `packages/client/src/core/ModelData.ts` — импорты `./Pair`, `./Point` (нет), обращение к несуществующему `PointModel.vector`.
- `packages/client/src/core/PointsSceneTester.ts` — импортирует `EdgeModel` из `./models/Edge` (фактически в `./models/EdgeModel.ts`); **однако подключён в `index.ts`** — убрать нельзя, только фиксить импорт.
- `xxx/` (в git!) — черновики: `task.md`, `dg.md`, `src/server.ts` (старый драфт сервера на expressAdapter).
- `example/` — gitignored-мусор (JSON-дампы, `getEmbeddings.~ts` temp-файл).
- Сервер: эндпоинт `/document/{id}/parse` (возвращает `{}`); дубль `updateatSchema` в **base.controller.ts** и **documents.controller.ts** (обе не используются); закомментированные прisma/mdforge/scalar.
- `packages/shared/src/utils/vector.ts`: `cosineDistance` — по факту squared-Euclidean; `accurateSum` — мёртвый код после `return`.

---

## 5. AI Guardrails — правила для агентов

**Нельзя / опасно:**
1. **Не редактировать generated-код руками**: `packages/server/src/clients/embedder/*` и `packages/client/src/clients/dew/*` — только через `generators/*` (`download.cmd` → `generate.cmd`). Учёт: `generators/embedder/download.cmd` указывает НЕВЕРНЫЙ URL (8081 вместо 8000) — перед запуском сверить spec.
2. **Не добавлять зависимости в `packages/shared`** — там нет `package.json`, они не резолвятся. Зависимости объявлять в `packages/server/package.json` / `packages/client/package.json` (пока shared не превратят в нормальный workspace-пакет).
3. **Не использовать `sleep` в sync shell-коде** (Windows/cmd) — только `setTimeout`/`Atomics.wait`. Шаблон — async-ветки **db-manager.ts**.
4. **Порт дебаггера сервера — строго 9229** (см. `debug` в `packages/server/package.json`). `.vscode/launch.json` с 5858 — известная ошибка, не «оправдывать» её.
5. **Не обходить `IRepository`**: прямой `pg`/drizzle-запрос в контроллерах запрещено; транзакции — через `tx`-параметры репозитория.
6. **Не ломать PK/upsert-контракты**: `chat_messages(session_id,message_id)`, `message_fragments(+fragment_order)`, `message_files(+file_id)`, `embeddings(session_id,model_name,created_at)`, `files(id)`.
7. **Не выводить в логи креденшелы** (`user.credentials`: authorization/cookie) и контент файлов; `@LogParamSafe` логирует аргументы — не применять к методам с чувствительными параметрами.
8. **Не коммитить**: `.env` (в gitignore), `packages/{server,client}/src/shared/*` (джанкшены), `models/*` (локальный HF-кэш), `example/*`, данные postgres.
9. **Не «чинить» мёртвые файлы клиента** (раздел 4) удалением без проверки ссылок; `PointsSceneTester.ts` — исключение, он подключён.
10. **Не запускать `tsc` клиента на его локальном TS5** и не «лечить» это выключением `noUnusedLocals` — корень проблемы: версия TS + мёртвые файлы.

**Надо учитывать при правках:**
- **`import "@utils/array-extensions";`** — сайд-эффект, без него нет `uniqueBy/groupBy/mapAsync` на прототипе (в `Map` встроенного `groupBy` Node 22+ конфликтует по сигнатуре — кастомный не ставится, если есть нативный).
- Новый alias → в `tsconfig.base.json` (server И/или client); для server release обязателен `tsc-alias`.
- `Embedding`-модель: `embedding` хранится как `number[]` в `jsonb`-колонке `embedding_vector`; `dimension` — длина.
- `bytea` = hex-строка в JS-слое (customType **types.ts**); `MessageFile.content` — hex или `null`.
- `deepseek.ts` — credentials из `user.credentials` расширяют «браузерные» заголовки; порядок spread важен.
- Root-скрипты — Windows-конвенции (`cd generators\dew`); при кроссплатформенных правках учитывать.
- Клиент: React — только панели/huки; сцена — императивный SVG/D3; `vite-plugin-importmap` **намеренно выключен** (`mode === "production" && false`).
- `drizzle` `logger: true` — при диагностике это «помощь», при чистке — выключать по env.
- Черновики `xxx/` и `example/` — не часть продукта; цитировать их как фактологию нельзя.

**Быстрые точки входа для типовых задач:**
- «добавить API-эндпоинт» → `packages/server/src/controllers/*` (+ схемы в **base.controller.ts**) → перегенерировать клиент через `generators/dew`.
- «изменить синхронизацию DeepSeek» → `packages/server/src/program.ts` + `deepseek.ts`.
- «изменить эмбеддинги» → `packages/server/src/Embedder.ts` (+ `@utils/vector`).
- «изменить визуализацию» → `packages/client/src/core/{Scene,Engines,physics}/*` + `AppMediator`.
- «изменить утилиты» → `packages/shared/src/utils/*` (единственная точка, джанкшены разнесут сами).
