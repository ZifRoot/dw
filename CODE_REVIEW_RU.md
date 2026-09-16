# 1. Краткий итог

Проект уже имеет **хорошую предметную архитектуру**, особенно для pet-project, который вырос в достаточно сложную систему:

```text
DeepSeek
   │
   ▼
Server
 ├── PostgreSQL
 ├── Sync
 └── Embeddings
        │
        ▼
     REST API
        │
        ▼
Client
 ├── IndexedDB
 ├── PointModel
 ├── NeighborGraph
 ├── ModelManager
 ├── Physics
 └── SVG/D3
```

Особенно удачные решения:

* отдельный `IRepository`;
* транзакции в repository;
* разделение `PointModel` / `EdgeModel` / `EmbeddingModel`;
* отдельный `NeighborGraph`;
* отдельные physics engines;
* IndexedDB как локальный cache;
* OpenAPI + generated clients;
* `shared` для общих алгоритмических утилит;
* `SingleExecution` для защиты от повторного запуска.

Но сейчас код находится в состоянии **«рабочая исследовательская система»**, а не production-ready.

Главные проблемы сосредоточены не в UI, а в четырёх местах:

1. **модель данных графа имеет несколько логических противоречий;**
2. **Embedder содержит опасные состояния гонки/ошибки жизненного цикла;**
3. **server API фактически не защищён;**
4. **build/dev tooling сильно хрупкий.**

---

# 2. 🔴 Критические проблемы

## CRITICAL-1 — DeepSeek credentials хранятся как обычный JSONB

В `userTable`:

```ts
credentials: jsonb("credentials")
```

а `Deepseek` ожидает:

```ts
type credentials = {
    authorization: string;
    cookie: string;
};
```

и непосредственно добавляет их в HTTP headers.

Это означает, что в PostgreSQL лежат фактически **секреты авторизации DeepSeek**.

Проблема усугубляется тем, что API вообще не имеет нормальной authentication/authorization boundary.

То есть архитектурно получается:

```text
HTTP client
    │
    │ без auth
    ▼
/api
    │
    ▼
PostgreSQL
    │
    └── DeepSeek authorization/cookie
```

### Что делать

Минимум:

```text
Browser
   │
   ▼
API authentication
   │
   ▼
User context
   │
   ▼
credentials
```

И credentials должны быть:

* либо зашифрованы application-level encryption;
* либо вынесены в отдельный secrets storage;
* никогда не возвращаться через DTO;
* никогда не попадать в logs.

---

# 3. 🔴 API слушает `0.0.0.0`

`Program.start()`:

```ts
app.listen(PORT, "0.0.0.0", ...)
```

Для локального приложения это неожиданно опасно.

Если машина находится в сети:

```text
LAN
 │
 ├── attacker
 │
 ▼
:8081
 │
 └── /api/actions/update
```

а `/api/actions/update` запускает синхронизацию с DeepSeek.

То есть HTTP endpoint фактически способен инициировать операции от имени пользователя.

Для локального desktop-like приложения я бы сделал:

```ts
app.listen(PORT, "127.0.0.1")
```

А возможность bind на `0.0.0.0` вынес бы в configuration.

---

# 4. 🔴 `ActionController` не ждёт выполнение операции

Сейчас:

```ts
this.program.Update();
return c.json("OK", 200);
```

и аналогично:

```ts
this.program.UpdateEmbedding();
return c.json("OK", 200);
```

Это очень важная проблема.

HTTP:

```text
POST /actions/update
       │
       ├── запускает Update()
       │
       └── сразу → 200 OK
```

даже если через секунду:

```text
Update()
   ↓
DeepSeek request
   ↓
401
   ↓
exception
```

клиент уже получил `200`.

### Лучше

```ts
await this.program.Update();
return c.json({ status: "ok" }, 200);
```

Либо, что ещё лучше для долгих операций:

```text
POST /actions/update
       ↓
202 Accepted
       ↓
jobId
       ↓
GET /actions/update/{jobId}
```

Для embedding pipeline второй вариант гораздо правильнее.

---

# 5. 🔴 `EdgeModel.id` логически неправильный

Сейчас:

```ts
this.id = `${source.id}-${target.id}`;
```

Но edge содержит:

```ts
modelName
```

Следовательно:

```text
A ─── B [model1]

A ─── B [model2]
```

имеют одинаковый ID:

```text
A-B
```

Хотя это **два разных ребра**.

Это особенно важно, потому что весь проект поддерживает несколько embedding models.

### Должно быть что-то вроде

```ts
this.id = `${source.id}:${target.id}:${modelName}`;
```

или ещё лучше — canonical key:

```ts
static getId(sourceId, targetId, modelName) {
    const [a, b] = [sourceId, targetId].sort();
    return `${a}:${b}:${modelName}`;
}
```

Это одна из самых существенных логических ошибок клиентской модели.

---

# 6. 🔴 `PointGraphManager` мутирует входной `EdgeRef`

В:

```ts
edgeIndexToEdgeModel()
```

есть:

```ts
if (sourceIndex > targetIndex) {
    [edgeIndex.sourceId, edgeIndex.targetId] =
        [edgeIndex.targetId, edgeIndex.sourceId];
}
```

То есть функция с названием:

```text
edgeIndexToEdgeModel
```

не просто конвертирует объект, а **изменяет объект, который ей передали**.

Это особенно неприятно потому, что `EdgeRef` может быть:

* объектом из persisted state;
* объектом из IndexedDB;
* объектом из mediator;
* объектом, который потом используется для сохранения.

### Лучше

```ts
const sourceId = ...
const targetId = ...

const [canonicalSource, canonicalTarget] =
    sourceId < targetId
        ? [sourceId, targetId]
        : [targetId, sourceId];
```

Никаких mutation.

---

# 7. 🔴 `ModelManager` имеет O(N²) работу на каждый step

Это, пожалуй, главный performance bottleneck клиента.

В `improve()`:

```text
для каждой точки
    для каждой другой точки
        calculateAverageCosineDistance()
```

Получается примерно:

```text
O(N² × M × D)
```

где:

* `N` — количество sessions;
* `M` — количество embedding models;
* `D` — размерность embedding.

А после этого ещё:

```ts
newCandidates.sort(...)
```

То есть при 5 000 sessions это уже совсем другая категория нагрузки.

### Что я бы сделал

Вынести similarity computation в отдельный индекс:

```text
EmbeddingIndex
    │
    ├── model A
    │      └── vectors
    │
    ├── model B
    │      └── vectors
    │
    └── ...
```

И строить kNN:

```text
embedding vectors
       ↓
nearest-neighbor index
       ↓
top-K neighbors
       ↓
NeighborGraph
```

Для небольшого количества точек текущий алгоритм абсолютно нормален. Но масштабирование сейчас плохое.

---

# 8. 🔴 Смысл `intersection` и cosine similarity смешан

В проекте одновременно используются:

### Реальное semantic similarity

```ts
cosineDistance(v1, v2)
```

и:

```ts
activeIndices
intersectionCount
```

Причём `activeIndices` определяется:

```ts
abs(value[i]) > activationThreshold
```

и знак компоненты кодируется в индекс:

```text
+17
-17
```

Это уже не стандартная embedding metric.

Более того, в `PointsTransformer` используется:

```ts
0.5 // временно
```

а комментарий говорит:

> будет пересчитан позже

Но фактически `ModelManager` для similarity использует исходные vector values и cosine.

То есть сейчас есть две разные концепции:

```text
embedding intersection
        +
cosine distance
```

и граница между ними не вполне ясна.

Я бы это явно разделил:

```text
EmbeddingVector
    │
    ├── cosine similarity
    │
    └── sparse/signature representation
```

---

# 9. 🔴 `NeighborGraph` и `EdgeModel` используют разные представления уникальности

`NeighborGraph.hasEdge()` проверяет:

```text
source
target
modelName
```

но `EntityCollection` индексирует по:

```ts
model.id
```

а `EdgeModel.id`:

```text
source-target
```

Получается:

```text
логика uniqueness:
    source + target + model

физический ID:
    source + target
```

Это фундаментальная несогласованность.

Её нужно исправить в первую очередь.

---

# 10. 🟠 IndexedDB synchronization делает много последовательных запросов

`DataManager.syncEmbeddingsWithServer()`:

```ts
for (...)
    await this.db.embeddings.get(...)

for (...)
    await this.embeddingsApi.embeddingsSessionIdGet(...)
```

То есть потенциально:

```text
1000 embeddings
     ↓
1000 IndexedDB operations
```

и затем:

```text
N sessions
     ↓
N HTTP requests
```

Причём API уже имеет:

```text
GET /embeddings/query
```

Поэтому архитектурно можно значительно сократить round-trips.

---

# 11. 🟠 `syncPointsWithServer()` не удаляет локальные точки

Сейчас серверные документы добавляются/обновляются:

```ts
for (const doc of serverDocs) {
   ...
}
```

Но я не вижу симметричной операции:

```text
server no longer has document
        ↓
delete local PointTable
```

То есть IndexedDB может постепенно получить:

```text
server:
A B C

local:
A B C D E F
```

Если удаление сессий поддерживается DeepSeek/API — это реальная stale-data проблема.

---

# 12. 🟠 `DataManager` фактически проглатывает ошибки

```ts
reloadTables() {
    return this.reloadTablesSingle().catch(() => {});
}
```

Это очень плохо для диагностики.

Получается:

```text
sync failed
     ↓
catch
     ↓
ничего
```

Пользователь видит старый cache и может даже не узнать, что synchronization умерла.

Лучше:

```ts
catch (error) {
    logger.error(error);
    mediator.syncFailed(error);
    throw error;
}
```

---

# 13. 🟠 `BaseMediator` уничтожает type safety

```ts
private state = new Map<string, any>();
```

и:

```ts
get(key: string): any
set(key: string, value: any)
emit(... detail?: any)
```

При этом сверху `AppMediator` пытается создать type-safe API.

То есть архитектура:

```text
AppMediator
   ↓
typed methods
   ↓
BaseMediator
   ↓
ANY
```

В итоге TypeScript перестаёт защищать центральное состояние.

Я бы сделал generic event map:

```ts
class Mediator<TEvents extends EventMap> {
    set<K extends keyof TEvents>(
        key: K,
        value: TEvents[K]
    )
}
```

Тогда `any` можно практически полностью убрать.

---

# 14. 🟠 `AppMediator` стал God Object

Сейчас он одновременно:

* state container;
* event bus;
* command bus;
* notification bus;
* storage state;
* graph state;
* UI state.

Например в одном классе:

```text
progress
temperature
autoZoom
selectedPoint
selectedEdge

pointsTable
embeddingsTable
edgesTable

CLEAR_POINTS
ADD_POINT
START_REPULSION
SAVE_POSITIONS
POINTS_MODEL_READY
MODEL_MANAGER_STEP
...
```

Для текущего проекта это ещё терпимо, но дальнейшее развитие будет болезненным.

Я бы разделил:

```text
AppState
SceneEvents
SceneCommands
GraphEvents
DataEvents
```

Не обязательно делать Redux — достаточно нескольких специализированных mediator/event objects.

---

# 15. 🔴 Memory leak в physics engines

`RepulsionEngine` подписывается:

```ts
mediator.onStartRepulsion(() => this.start());
```

но unsubscribe не сохраняется.

То же самое в `GraphEngine`:

```ts
this.mediator.onStartRepulsion(() => this.start());
```

В отличие от `ModelManager`, где:

```ts
this.unsubPoints = ...
this.unsubStep = ...
```

и есть:

```ts
destroy()
```

### Нужно

```ts
private unsubStartRepulsion: () => void;

constructor(...) {
    this.unsubStartRepulsion =
        mediator.onStartRepulsion(() => this.start());
}

destroy() {
    this.unsubStartRepulsion();
    this.stop();
}
```

---

# 16. 🔴 `AnimationEngine` может оставить RAF после остановки

Схема:

```ts
for (const cb of this.callbacks) {
    cb();
}

...

this.rafId = requestAnimationFrame(...)
```

Если callback внутри себя вызовет:

```ts
removeCallback()
```

то `stop()` уже может быть вызван, а после выхода из callback `AnimationEngine` всё равно создаст новый RAF.

Кроме того, если callback бросит exception:

```text
callback()
   ↓
throw
   ↓
step() прерван
   ↓
requestAnimationFrame() не вызван
```

а `isRunning` может остаться `true`.

Это достаточно неприятный lifecycle bug.

---

# 17. 🔴 Embedder слишком сильно завязан на конкретное поведение LM Studio

`EmbedderLmStudio` делает:

```text
GET /api/v1/models
       ↓
find embedding model
       ↓
load model
       ↓
reset cache
       ↓
GET models
       ↓
get instance ID
       ↓
POST /v1/embeddings
```

Но класс одновременно:

* обнаруживает модели;
* выбирает модели;
* управляет lifecycle модели;
* вызывает embedding;
* читает БД;
* определяет pending sessions;
* пишет БД.

Это уже несколько responsibilities.

Я бы выделил:

```text
LmStudioClient
EmbeddingModelRegistry
EmbeddingProcessor
EmbeddingRepository
EmbeddingScheduler
```

---

# 18. 🟠 `getModelIdentifier()` имеет опасный `!`

```ts
model = (await this.getModels())
    .find((m) => m.key == model?.key)!;
```

Здесь разработчик утверждает:

```text
"модель точно существует"
```

но это не гарантируется.

Например:

```text
models cache
    ↓
model unloaded/changed
    ↓
reset
    ↓
find() === undefined
    ↓
model.key
    ↓
TypeError
```

Нужна явная проверка.

---

# 19. 🟠 Embedding DB model странно спроектирована

PK:

```text
sessionId
model_name
createdAt
```

То есть одна session + model может иметь **много embeddings**, если timestamps разные.

Но бизнес-логика `EmbedderLmStudio` воспринимает:

```text
(session, model)
```

как уникальную пару:

```ts
findEmbeddingBySessionAndModel(...)
```

Это две разные модели данных.

Я бы выбрал одну из двух моделей:

### Вариант A — immutable history

```text
session
model
version
created_at
```

и явно хранить версии.

### Вариант B — current embedding

```text
PRIMARY KEY(session_id, model_name)
```

и upsert.

Для текущей архитектуры, судя по поведению кода, больше подходит **B**.

---

# 20. 🟠 `/document/{id}/parse` сейчас fake endpoint

```ts
const parsed = {};
return c.json(parsed, 200);
```

При этом endpoint называется:

```text
/document/{id}/parse
```

и OpenAPI говорит:

```text
Результат парсинга
```

Но фактически parser закомментирован.

Это хуже, чем отсутствие endpoint, потому что API создаёт ложное ощущение, что функциональность существует.

Я бы либо:

```text
404/501 Not Implemented
```

либо удалить endpoint до реализации.

---

# 21. 🟠 `buildFullText()` имеет N+1 query

```ts
const messages = await this.repo.findAllMessages(sessionId);

for (const msg of messages) {
    const fragments =
        await this.repo.findAllFragments(sessionId, msg.messageId);
}
```

То есть:

```text
1 query messages
+
N queries fragments
```

Лучше один:

```sql
SELECT *
FROM message_fragments
WHERE session_id = ?
ORDER BY message_id, fragment_order
```

и группировать в JS.

То же самое касается `buildFragmentsList()`.

---

# 22. 🟠 `any` используется именно там, где нужна типизация

Например:

```ts
private async buildFragmentsList(
    sessionId: string,
    messages: any[]
): Promise<any[]>
```

и:

```ts
z.array(z.any())
```

в API schema.

Это ломает главный плюс TypeScript + Zod + OpenAPI.

Я бы сделал:

```ts
interface FragmentDto {
    id: string;
    messageId: number;
    size_bytes: number;
    name?: string;
}
```

и полноценную Zod schema.

---

# 23. 🔴 `EmbeddingsController` содержит `Promise` вместо результата

В POST:

```ts
const count = [...embeddingsCreate.groupBy(...)]
    .reduce(async (r, c) => {
        return (await r) +
               (await this.repo.createManyEmbeddings(...));
    }, Promise.resolve(0));
```

`count` здесь — Promise.

А затем:

```ts
return c.json({
    status: "ok",
    received: count
}, 200);
```

То есть JSON может содержать не число, а сериализованное некорректно значение.

Это известный и реальный bug.

Нужно:

```ts
const count = await [...groups]
    .reduce(async (r, [sessionId, embeddings]) => {
        return await r +
            await this.repo.createManyEmbeddings(
                sessionId,
                embeddings
            );
    }, Promise.resolve(0));
```

Хотя ещё лучше — просто:

```ts
let count = 0;

for (const [sessionId, embeddings] of groups) {
    count += await this.repo.createManyEmbeddings(
        sessionId,
        embeddings
    );
}
```

Здесь читаемость важнее красивого `reduce`.

---

# 24. 🔴 `fetch_page_all()` может упасть на пустой странице

```ts
let ud0 = chat_sessions[0].updated_at;
```

`ud0` вообще не используется.

То есть достаточно:

```text
DeepSeek
  ↓
chat_sessions = []
  ↓
chat_sessions[0]
  ↓
undefined.updated_at
  ↓
crash
```

Просто удалить `ud0` или проверять empty page.

---

# 25. 🟠 `Deepseek` содержит слишком много browser-specific headers

Например:

```text
sec-ch-ua
sec-fetch-site
sec-fetch-mode
sec-ch-ua-platform
...
```

Это не хорошая abstraction.

API client должен хранить:

```text
Authorization
Cookie
Accept
Content-Type
```

а не пытаться имитировать конкретный Chrome.

Тем более:

```text
Chrome 145
Windows
x-client-version = 1.7.0
x-app-version = 20241129.1
```

жёстко зашиты.

Это создаёт технический долг при изменении DeepSeek API.

---

# 26. 🟠 `Deepseek` не проверяет HTTP status

`GET()`:

```ts
return await fetch(url, ...)
```

А дальше:

```ts
resp.json()
```

или:

```ts
resp.arrayBuffer()
```

Без:

```ts
if (!resp.ok)
```

Поэтому:

```text
401
403
429
500
```

могут превращаться в странные ошибки JSON parsing вместо нормального domain error.

Нужен единый:

```ts
request()
```

который:

1. делает fetch;
2. проверяет HTTP status;
3. читает error body;
4. добавляет endpoint/status;
5. делает retry для 429/5xx, если допустимо.

---

# 27. 🟠 `Repository` слишком большой

`DrizzleRepository.ts` — около **29 KB** только по размеру файла.

В нём одновременно:

```text
users
sessions
messages
files
fragments
embeddings
transactions
mapping
business-ish queries
```

Это уже не просто repository одного aggregate.

Я бы разделил:

```text
UserRepository
SessionRepository
MessageRepository
FileRepository
EmbeddingRepository
```

а поверх них:

```text
DeepSeekSyncService
EmbeddingService
```

---

# 28. 🟠 В `DrizzleRepository` есть подозрительные naming/semantic leftovers

Например:

```text
findAllFragmentsShrort
```

Опечатка `Shrort`.

Также встречаются:

```text
messageFilesTable.messageId
```

при работе с `filesTable`.

Такие вещи не ломают приложение, но показывают, что repository уже трудно удерживать в голове.

---

# 29. 🟠 `InitDb()` возвращает `null!`

```ts
if (!DbManager.startAndWaitSync()) return null!;
```

Это буквально:

```ts
return null as IRepository;
```

То есть TypeScriptу говорят:

> «поверь мне, это IRepository».

А потом в `Program` появляются:

```ts
if (!this.repository)
```

Это признак рассинхронизации типов и runtime.

Лучше:

```ts
IRepository | null
```

либо вообще бросать exception при невозможности поднять DB.

---

# 30. 🔴 Shared реализован через symlink/junction

Это один из наиболее неприятных инфраструктурных костылей.

`link-shared.sh` создаёт:

```text
packages/server/src/shared
       ↓
packages/shared/src
```

и:

```text
packages/client/src/shared
       ↓
packages/shared/src
```

А `tsconfig` сервера прямо ожидает:

```text
@utils/*
    → src/shared/utils/*
```

Получается, чистый clone репозитория находится в состоянии:

```text
clone
 ↓
npm install
 ↓
проект ещё не готов
 ↓
нужно запустить специальный скрипт
 ↓
создать filesystem links
```

Это плохой dependency model.

### Нормальный вариант

Сделать:

```text
packages/shared/package.json
```

и workspace:

```json
"workspaces": [
    "packages/client",
    "packages/server",
    "packages/shared"
]
```

После чего:

```ts
import { ... } from "@dw/shared";
```

Без junction.

---

# 31. 🔴 Root `package.json` всё ещё содержит сломанные scripts

Например:

```json
"build:release":
  "npm run build:client:release && npm run build:server :release"
```

Здесь явно лишний пробел:

```text
build:server :release
            ^
```

Должно быть:

```text
npm run build:server:release
```

Кроме того, в README уже описана другая структура команд, чем фактически находится в `package.json`.

---

# 32. 🔴 Cross-platform tooling пока не является cross-platform

Root scripts используют:

```text
cd generators\dew
generate.cmd
rm -rf
```

То есть:

```text
Windows → работает частично
Linux → часть scripts ломается
macOS → часть scripts ломается
```

Хотя README уже заявляет Linux/Mac.

Нужно выбрать:

### либо

официально:

```text
Windows only
```

### либо

делать npm scripts через Node:

```js
scripts/
    link-shared.mjs
    clean.mjs
    generate.mjs
```

и тогда:

```json
"clean": "node scripts/clean.mjs"
```

---

# 33. 🔴 `packages/client/package-lock.json` не должен жить отдельно

В workspace есть:

```text
/package-lock.json
/packages/client/package-lock.json
```

При npm workspaces это практически всегда источник рассинхронизации.

Оставить один:

```text
/package-lock.json
```

---

# 34. 🟠 `typescript` в разных местах создаёт путаницу

Root:

```text
typescript ^6.0.3
```

Client тоже сейчас показывает:

```text
typescript ^6.0.3
```

Но исторические документы в репозитории всё ещё описывают конфликт TS5/TS6. Это хороший пример того, почему documentation snapshot уже начинает расходиться с кодом.

---

# 35. 🟠 `tsconfig` слишком странно устроен

Root:

```json
"module": "commonjs"
```

Client:

```text
Vite
React
ES modules
```

Server:

```text
CommonJS
```

Это допустимо, но shared package тогда приходится адаптировать сразу под две module systems.

При современном Node/Vite я бы рассмотрел:

```text
ESM everywhere
```

если DeepSeek/runtime dependencies позволяют.

---

# 36. 🟠 `EntityCollection` предоставляет `_setPoints()` наружу

```ts
public _setPoints(...)
```

Underscore говорит:

> private implementation detail

но TypeScript говорит:

> public API.

Это особенно опасно для структуры:

```text
items
indexMap
```

Поскольку любой код может получить:

```ts
collection.items
collection.indexMap
collection._setPoints(...)
```

и нарушить invariant.

Я бы сделал:

```ts
private setPoints(...)
```

а наружу:

```ts
add
remove
replace
update
clear
```

---

# 37. 🟠 `EntityCollection.clone()` не настоящий clone

```ts
newCollection.items =
    this.items.map(item => ({ ...item }));
```

Для `PointModel` это особенно важно.

Получается:

```text
PointModel
   ↓ spread
plain object
```

То есть:

```ts
instanceof PointModel
```

уже false.

Методы класса тоже исчезают.

Если `clone()` должен копировать domain entities — он должен делегировать:

```ts
item.clone()
```

или принимать clone factory.

---

# 38. 🟠 `PointModel.clone()` не клонирует embeddings

```ts
return new PointModel(...)
```

Но:

```ts
embeddings
```

является отдельным mutable `Map`.

Поэтому:

```ts
const p2 = p1.clone();
```

не копирует embedding state вообще.

Если clone используется только для координат — нормально, но название `clone()` вводит в заблуждение.

Лучше:

```ts
clonePosition()
```

или полноценный deep clone.

---

# 39. 🟠 `RepulsionEngine` содержит две версии одного алгоритма

Есть:

```text
applyPair1
applyPair2
applyPair
```

Причём `applyPair1/2` выглядят как предыдущая реализация, а реально используется:

```ts
applyPair()
```

Это dead/legacy code.

Я бы удалил старую ветку.

---

# 40. 🟠 `GraphEngineConfig.targetDistance` фактически не используется

Конфиг:

```ts
targetDistance = 100 * 1.5;
```

но `GraphEngine` берёт:

```ts
const targetDistance = edge.distance;
```

То есть у конфигурации есть parameter, который вводит разработчика в заблуждение.

Либо убрать его, либо действительно использовать.

---

# 41. 🟠 SQL/model layer содержит несколько разных смыслов размера данных

В `drizzle-schema.ts` есть:

```text
message_fragments.size
files.file_size
embedding processing_time
session_total_size
session_throughput
session_speed
speedx
```

При этом одни views считают:

```text
RESPONSE fragments
```

а другие:

```text
all fragments
```

а `speedx` ещё складывает:

```text
fragments + files
```

Это может привести к тому, что метрики моделей будут несопоставимыми.

Нужно явно определить:

```text
logical text size
download size
embedding input size
file size
total session size
```

и использовать их последовательно.

---

# 42. 🟠 OpenAPI сейчас не является единственным источником истины

У тебя одновременно есть:

```text
openapi.json
generators/dew/specs/openapi.json
packages/server/controllers
generated clients
```

и отдельный embedder spec.

Причём в документации уже зафиксирован баг, что `embedder/download.cmd` скачивает неправильный spec. Репозиторий содержит именно такую инфраструктуру генерации.

Правильнее сделать pipeline:

```text
server source
    ↓
generated OpenAPI
    ↓
openapi.json
    ↓
generated client
```

а не:

```text
ручной spec
   ↕
server
   ↕
generated client
```

---

# 43. 🟠 Документация уже начинает становиться техническим долгом

В репозитории есть:

```text
PROJECT_CONTEXT.md
INDEPENDENT_ANALYSIS.md
report-to-update.md
deep - 2026-09-15 20.01.md
packages/client/*.md
```

Это полезно во время разработки, но сейчас часть этих документов описывает **старое состояние проекта**.

Особенно опасна ситуация:

```text
AI читает PROJECT_CONTEXT
       ↓
делает вывод
       ↓
код уже изменился
```

Для AI-assisted development это реально может привести к ошибочным изменениям.

Я бы оставил только:

```text
README.md
ARCHITECTURE.md
docs/
```

а временные AI-анализы перенёс в:

```text
docs/archive/
```

или вообще удалил после использования.

---

# 44. Что мне особенно понравилось

Теперь позитивная часть — её тоже важно отметить.

## Хорошо сделан Repository abstraction

`IRepository` + `DrizzleRepository` — правильное направление.

Особенно хорошо, что методы принимают optional transaction:

```text
createX(data, tx?)
```

и repository может выполнять операции внутри внешней транзакции.

Это значительно лучше, чем размазывать Drizzle по controllers.

---

## Хорошо разделён graph domain

Есть:

```text
PointModel
EdgeModel
EmbeddingModel
NeighborGraph
PointGraphManager
ModelManager
```

Это уже хороший domain decomposition.

Особенно мне нравится идея:

```text
NeighborGraph
    ↓
EdgeRef

PointGraphManager
    ↓
EdgeModel
```

Только сейчас надо довести эту модель до строгой консистентности.

---

# 45. Как я бы перестроил проект

Я бы не делал сейчас «переписать всё».

Сделал бы **пять последовательных этапов**.

## Этап 1 — исправить реальные bugs

В первую очередь:

```text
1. await ActionController.Update()
2. await UpdateEmbedding()
3. embeddings received Promise bug
4. fetch_page_all empty page
5. EdgeModel.id
6. EdgeRef mutation
7. AnimationEngine lifecycle
8. unsubscribe physics
9. HTTP status DeepSeek
10. null! repository
```

Это даст максимальный эффект при минимальном количестве изменений.

---

# 46. Этап 2 — привести graph model к строгой математической модели

Я бы сделал:

```ts
type EdgeKey = {
    sourceId: string;
    targetId: string;
    modelName: string;
};
```

и единственную функцию:

```ts
function canonicalEdgeKey(edge: EdgeKey): string
```

Например:

```text
min(A,B):max(A,B):model
```

Тогда:

```text
NeighborGraph
      │
      ├── EdgeKey
      │
      └── EdgeModel
```

везде использует одинаковую identity.

Это уберёт очень много потенциальных багов.

---

# 47. Этап 3 — разделить server business logic

Сейчас:

```text
Program
 ├── DB lifecycle
 ├── DeepSeek sync
 ├── files
 └── embeddings
```

Я бы получил:

```text
Program
 │
 ├── DeepSeekSyncService
 │
 ├── FileSyncService
 │
 └── EmbeddingService
```

а внутри:

```text
DeepSeekClient
EmbeddingClient
Repositories
```

Тогда controller становится почти тривиальным:

```ts
await syncService.update();
```

---

# 48. Этап 4 — сделать shared настоящим workspace package

Вместо:

```text
packages/shared/src
      ↑
symlink
      ↑
server/src/shared
client/src/shared
```

сделать:

```text
packages/shared/
    package.json
    src/
```

и:

```text
@dw/shared
```

Это уберёт огромный класс проблем с clone/build/Windows/Linux.

---

# 49. Этап 5 — оптимизировать граф

Только после исправления correctness.

Сейчас:

```text
N points
 ↓
N² cosine comparisons
 ↓
sort
 ↓
K neighbors
```

Я бы постепенно пришёл к:

```text
Embeddings
    ↓
EmbeddingIndex
    ↓
kNN
    ↓
NeighborGraph
```

Причём отдельно по каждой модели:

```text
model A → kNN_A
model B → kNN_B
model C → kNN_C
```

Затем объединение.

Это позволит системе перейти от:

```text
hundreds of sessions
```

к:

```text
thousands / tens of thousands
```

без полного пересчёта всего графа на каждом шаге.

---

# 50. Приоритеты

Если составить backlog именно по влиянию:

| Приоритет | Проблема                           |
| --------- | ---------------------------------- |
| 🔴 P0     | API authentication + credentials   |
| 🔴 P0     | `EdgeModel.id` без modelName       |
| 🔴 P0     | `ActionController` fire-and-forget |
| 🔴 P0     | embedding `Promise` bug            |
| 🔴 P0     | DeepSeek HTTP error handling       |
| 🔴 P1     | `AnimationEngine` lifecycle        |
| 🔴 P1     | physics unsubscribe                |
| 🔴 P1     | `null!` DB initialization          |
| 🔴 P1     | shared symlink architecture        |
| 🟠 P1     | N+1 в DocumentsController          |
| 🟠 P1     | N² ModelManager                    |
| 🟠 P1     | IndexedDB synchronization          |
| 🟠 P1     | embedding DB identity              |
| 🟠 P2     | God-object AppMediator             |
| 🟠 P2     | giant DrizzleRepository            |
| 🟠 P2     | `any` в API/domain                 |
| 🟠 P2     | legacy/dead code                   |
| 🟡 P2     | documentation drift                |
| 🟡 P3     | naming/style/typos                 |

---

# Главное впечатление

**Я бы не переписывал этот проект.**

У него уже сформировалось вполне разумное ядро:

```text
Repository
     +
Sync services
     +
Embedding pipeline
     +
Point/Edge domain
     +
Graph
     +
Physics
     +
IndexedDB
     +
D3 renderer
```

Проблема сейчас не в том, что архитектура неправильная. Проблема в том, что проект **перерос первоначальные abstractions**, и некоторые из них теперь начали конфликтовать между собой.

Самый показательный пример:

```text
Edge identity
```

Код уже мыслит:

```text
source + target + model
```

но storage identity всё ещё:

```text
source + target
```

Аналогично с:

```text
(session, model)
```

у embeddings.

Именно такие **нарушения инвариантов** я бы сейчас исправлял в первую очередь — они опаснее косметического рефакторинга.

Репозиторий: [ZifRoot/dw / dev](https://github.com/ZifRoot/dw/tree/dev?utm_source=chatgpt.com)

Если двигаться практически, следующим шагом я бы сделал **P0/P1 patch plan по конкретным файлам с точными изменениями**, а затем можно последовательно исправлять их прямо в `dev`, начиная с `EdgeModel`/`NeighborGraph` и server action/embedding bugs.
