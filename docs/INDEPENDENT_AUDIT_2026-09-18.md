# Независимый аудит проекта DW

Дата: 2026-09-18
Репозиторий: ZifRoot/dw
Ветка аудита: independent-audit-2026-09-18
Аудируемая ветка: dev
Аудируемый commit: 336ac58413c68d3fb066d1148f8ea6d732429616
Объём: 283 файлов, 60 директорий в Git tree.

## 1. Методика

Аудит выполнен независимо от ранее сохранённых CODE_REVIEW.md, CODE_REVIEW_RU.md, INDEPENDENT_ANALYSIS.md и других аналитических документов. Выводы сформированы по исходному коду, конфигурации, Git tree и истории ветки dev.

Проверялись архитектура monorepo; client React/D3/mediator/data-flow; server Express + Hono; DeepSeek sync; PostgreSQL; IndexedDB; embeddings; graph algorithms; physics; error handling; concurrency; TypeScript; npm scripts; security; API contracts; migrations; tests и CI.

Это статический аудит. Полный npm install, runtime build, PostgreSQL, браузер, DeepSeek, LM Studio, нагрузочное и penetration testing не выполнялись.

## 2. Краткий вывод

Архитектурный фундамент проекта уже сформирован: server, client, shared utilities, PostgreSQL, IndexedDB, OpenAPI clients, графовая модель и отдельные physics engines.

Главный риск сейчас не в отсутствии архитектуры, а в отсутствии единого эксплуатационного контура. Особенно опасны silent failures, неинкрементальная синхронизация embeddings, расхождение API DTO с repository, сломанный root release script, отсутствие тестов/CI и отсутствие защиты credentials/action endpoints.

## 3. Критические и высокие проблемы

### AUD-001 — Root release build сломан
Severity: Critical

Файл: package.json.

build:release вызывает npm run build:server :release, тогда как в scripts существует build:server:release. Лишний пробел делает корневой release command некорректным.

Рекомендация: исправить script и добавить CI smoke-check чистого release build.

### AUD-002 — Ошибки бизнес-операций скрываются
Severity: Critical

Файлы: packages/shared/src/utils/logger.ts, packages/server/src/program.ts, packages/server/src/controllers/action.controller.ts, packages/client/src/core/data/DataManager.ts.

LogSafe и Safe возвращают null вместо проброса исключения. reloadTables дополнительно делает catch(() => {}). ActionController после await program.Update() возвращает 200 OK.

Возможен сценарий: sync падает, ошибка скрывается, HTTP всё равно сообщает OK.

Рекомендация: логирование не должно менять семантику исключения. Ошибка sync должна попадать в HTTP error response и UI.

### AUD-003 — SingleExecution может создавать unhandled rejection
Severity: High

Файл: packages/shared/src/utils/single-runner.ts.

В createSingleCallGuard и ExecutionGuard результат Promise.finally() игнорируется. При rejection производный Promise также rejected и потенциально становится источником unhandledRejection.

Рекомендация: cleanup делать через явную success/error цепочку либо обрабатывать cleanup-promise.

### AUD-004 — Embedding sync не является incremental
Severity: High

Файл: packages/client/src/core/data/DataManager.ts.

lowDate постоянно равен дате в 2000 году, а reloadTablesSingle каждый раз делает embeddingsQueryGet с этой датой. После этого для затронутых sessions повторно загружаются полные embeddings.

При росте данных это увеличивает network traffic, JSON/vector memory, IndexedDB writes и время reload.

Рекомендация: хранить watermark последней успешной синхронизации и продвигать его только после успешного sync.

### AUD-005 — Embedding API contract расходится с реализацией
Severity: High

Файл: packages/server/src/db/DrizzleRepository.ts.

findEmbeddingsByDate принимает modelname, но не использует его в запросе. Кроме того, запрос выбирает только sessionId, model_name, createdAt и processing_time_ms, тогда как EmbeddingDtoSchema требует embedding и dimension.

Рекомендация: разделить metadata DTO и full embedding DTO и реально реализовать model filter.

### AUD-006 — Client не хранит историю embeddings
Severity: High

Файл: packages/client/src/core/data/PointDB.ts.

IndexedDB key embeddings: [session_id, model_name]. PostgreSQL key embeddings: [sessionId, model_name, createdAt]. Server допускает несколько версий одной session/model, client — только одну.

Рекомендация: явно определить latest-only semantics или добавить created_at в client key.

### AUD-007 — Local sync не удаляет исчезнувшие server sessions
Severity: High

Файл: packages/client/src/core/data/DataManager.ts.

syncPointsWithServer только добавляет и обновляет точки. Local records, которых больше нет в serverDocs, не удаляются.

Рекомендация: определить authoritative source и реализовать явную delete semantics.

### AUD-008 — Credentials DeepSeek хранятся без encryption-at-rest
Severity: Critical

Файлы: packages/server/src/db/models/User.ts, packages/server/src/db/drizzle/drizzle-schema.ts, packages/server/src/deepseek.ts.

User.credentials имеет тип unknown и хранится в БД; Deepseek использует authorization и cookie headers. Отдельного encryption layer не обнаружено.

API mutation endpoints также не имеют authentication/authorization middleware. Сейчас server слушает 127.0.0.1, что снижает прямую внешнюю поверхность, но это ограничение исчезнет при внешнем deployment/reverse proxy.

Рекомендация: encrypted credentials, authentication для action endpoints, rate limiting и явный local-only policy.

### AUD-009 — DeepSeek integration жёстко привязана к Web API
Severity: High

Файл: packages/server/src/deepseek.ts.

Используется chat.deepseek.com/api/v0 с вручную заданными browser headers и client versions. GET не проверяет response.ok; JSON приводится через type assertion; timeout, AbortController, retry/backoff и schema validation отсутствуют.

Рекомендация: изолировать adapter за IDeepSeekSource и добавить transport timeout, validation и retry policy.

### AUD-010 — File ingestion создаёт Promise для всех файлов сразу
Severity: High

Файл: packages/server/src/program.ts.

FilesUser создаёт files.map(file => file_1(...)) и затем Promise.all. Throttler ограничивает частоту запросов, но не размер очереди и не количество удерживаемых результатов.

Риск: memory pressure, большой GC и резкий рост работы при sync пользователя с большим числом файлов.

Рекомендация: bounded concurrency и пакетная обработка.

### AUD-011 — Safe скрывает ошибки отдельных файлов
Severity: High

Файл: packages/server/src/program.ts.

file_1 помечен @Safe. Ошибка отдельного файла может быть превращена в null, а общий Promise.all — успешно завершён.

Для ingestion pipeline это опасно: частично импортированные данные выглядят как успешный импорт.

Рекомендация: возвращать Result/statistics processed/failed/skipped и явно сохранять состояние ошибок.

### AUD-012 — Root scripts и workspace scripts имеют разные рабочие контексты
Severity: High

Файл: package.json.

Root docker:up/down используют src/db/db-manager.ts из root, хотя код находится в packages/server. Root devDependencies содержат tsx, а ts-node находится в server devDependencies. db:* запускаются из root при отсутствии root Drizzle config. generate:dew использует Windows-style path и .cmd.

Рекомендация: root CLI сделать единым orchestration layer и вызывать workspace commands через npm --workspace.

### AUD-013 — shared не является настоящим workspace package
Severity: Medium

Root workspaces содержат client и server, но не shared. Вместо package используется ручной symlink/junction через link-shared.sh и link-shared.cmd.

Fresh checkout требует дополнительного шага. Это ухудшает reproducibility и CI.

Рекомендация: создать packages/shared/package.json и включить shared в npm workspaces.

### AUD-014 — BaseMediator теряет type safety
Severity: Medium

Файлы: packages/client/src/core/BaseMediator.ts и AppMediator.ts.

AppEventMap уже существует, но BaseMediator хранит Map<string, any>, get/set/emit/on используют any. Значит центральный event/state contract фактически не проверяется компилятором.

Рекомендация: generic Mediator<EventMap> и единый контракт event payloads. При этом physics configs не нужно складывать в mediator автоматически.

### AUD-015 — Lifecycle cleanup неполный
Severity: Medium

Файлы: PointsScene.ts, EdgesScene.ts, SvgEngine.ts.

PointsScene подписывается на onAutoZoom без сохранения disposer. SvgEngine.onZoom возвращает disposer, но сцены его не сохраняют. EdgesScene.destroy() дважды вызывает unsubPointsUpdating.

Рекомендация: every subscribe -> stored unsubscribe -> destroy.

### AUD-016 — UI selection влияет на physics
Severity: Medium

Файл: packages/client/src/core/models/PointModel.ts.

fixed определяется как dragged || selected || pinned. Поэтому выбор точки автоматически фиксирует её в physics.

Это может быть сознательной UX policy, но связь UI selection и physics state сейчас скрыта в модели.

Рекомендация: разделить selected, dragged, pinned и physicsFixed.

### AUD-017 — RepulsionEngine кэширует производную config
Severity: Medium

Файл: packages/client/src/core/physics/RepulsionEngine.ts.

targetDistSq вычисляется в constructor из config.targetDistance. При runtime изменении config.targetDistance applyPair использует новый targetDistance, но старый targetDistSq.

Рекомендация: не кэшировать derived value из mutable config или обновлять cache через единый setter.

### AUD-018 — Generated API clients дублируются
Severity: Medium

В client присутствуют dew/fetch и dew/axios; на server ранее присутствовали embedder/fetch и embedder/axios. Для server embedding service поддерживаемым транспортом выбран Axios: application flow использует `src/clients/embedder/axios`. Fetch-клиент требует DOM-oriented типы и несовместим с серверным Node.js TypeScript context, поэтому он удалён.

Решение: для server embedding client оставлен только Axios.

### AUD-019 — Нет тестов и CI
Severity: Critical

В Git tree не обнаружены test/, tests/, __tests__, .test.ts, .spec.ts или .github/workflows.

Нет автоматической проверки build, sync, API contracts, repository, graph algorithms, IndexedDB и physics.

Рекомендация: начать с unit tests для EntityCollection, NeighborGraph, ModelManager, Throttler, SingleExecution и sync; затем добавить CI typecheck/build/test.

### AUD-020 — README расходится с текущим кодом
Severity: Medium

README описывает embedding service localhost:8000 и TypeScript 5, тогда как текущий код использует LM Studio localhost:1234 и TypeScript 6. Документация также описывает более старую архитектуру.

Рекомендация: архитектурные изменения должны сопровождаться обновлением README и текущей architecture document.

## 4. Сильные стороны

EntityCollection имеет хорошую модель стабильного массива + indexMap + swap-with-last и встроенный validate().

NeighborGraph разделяет edgeCollection и adjacency pointId -> Set<edgeId>; это удачнее хранения индексов, потому что EntityCollection меняет порядок элементов при удалении.

ModelManager уже использует frame budget, постепенную оптимизацию, random candidates и отдельный PointGraphManager.

DataManager отделяет IndexedDB и server sync от PointsTransformer и PointGraphManager; крупные массивы не передаются через mediator.

## 5. Инварианты, которые следует превратить в тесты

Graph: каждое edge должно присутствовать в edgeCollection и в adjacency обоих endpoints; adjacency не должен содержать несуществующие edge ids.

EntityCollection: items.length == indexMap.size; indexMap должен указывать на правильный item после любого add/update/remove/batch remove.

Sync: нужно формально определить authoritative source, deletion semantics и latest embedding semantics.

Physics: протестировать fixed/fixed, fixed/free, coincident points, distance < target, == target и > target.

## 6. Приоритет работ

### P0

1. Убрать silent failure из Safe/LogSafe.
2. Исправить root build:release.
3. Добавить CI с typecheck/build.
4. Исправить embedding API contract.
5. Определить security boundary для credentials и action endpoints.

### P1

1. Сделать embedding sync incremental.
2. Определить latest/history semantics.
3. Добавить delete semantics local sync.
4. Ограничить file ingestion concurrency.
5. Добавить DeepSeek timeout/retry/schema validation.
6. Добавить unit tests для graph/sync/guards/throttler.

### P2

1. Превратить shared в workspace package.
2. Типизировать mediator через EventMap.
3. Формализовать lifecycle/dispose.
4. Удалить неиспользуемые generated transports.
5. Обновить documentation.

## 7. Итог

DW не выглядит проектом без архитектуры. Наоборот, основные подсистемы уже разделены и в client появилось несколько хороших stateful abstractions.

Основная техническая задолженность находится на границах подсистем:

error -> success; server -> client sync; API schema -> repository result; workspace -> filesystem link; mediator type -> any; mutable config -> cached state; documentation -> actual architecture.

Главный вывод независимого аудита: перед существенным расширением функциональности выгоднее стабилизировать существующие контракты. Ошибка должна оставаться ошибкой, sync должен быть действительно incremental, DTO должен соответствовать данным, а build должен воспроизводиться из чистого checkout.

## 8. Ограничения

Не выполнялись runtime npm install/build, PostgreSQL, browser runtime, реальные запросы DeepSeek/LM Studio, нагрузочное тестирование и penetration testing. Соответствующие выводы требуют отдельного validation pass.
