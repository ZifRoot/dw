# Повторный независимый аудит DW — 2026-09-23

**Репозиторий:** ZifRoot/dw  
**Аудируемая ветка:** dev  
**Аудируемый commit:** 3ab40fe04baab7a46d4740d5c51480e3155eaf29  
**Ветка аудита:** independent-audit-2026-09-23  
**Исходный список решений:** docs/INDEPENDENT_AUDIT_2026-09-18-list.md

---

## 1. Цель повторного аудита

Этот аудит является продолжением независимого аудита от 2026-09-18.

Сначала был прочитан и использован только как список заявленных решений файл docs/INDEPENDENT_AUDIT_2026-09-18-list.md. После этого каждое решение было сопоставлено с текущим состоянием ветки dev.

Решённые пункты исходного аудита повторно не разбирались как самостоятельные проблемы, если текущий код действительно подтверждает решение. Вместо этого выполнен более глубокий анализ тех границ системы, которые остались после исправлений.

# 2. Review решений предыдущего аудита

| AUD | Заявленное решение | Результат review |
|---|---|---|
| AUD-001 | исправлен | **Подтверждено** |
| AUD-002 | logger/single-runner semantics | **Есть возражение к итоговой API-семантике** |
| AUD-003 | logger/single-runner semantics | **Исправление подтверждено тестом** |
| AUD-004 | исправлен | **Подтверждено, но найден дополнительный performance-риск** |
| AUD-005 | исправлен | **Основной дефект исправлен** |
| AUD-006 | client хранит latest, server — историю | **Принято; соответствует текущему коду** |
| AUD-007 | не удалять локальные точки | **Принято; решение обосновано защитой локального состояния** |
| AUD-008 | не требуется | **Не возражаю в рамках текущего local-only deployment** |
| AUD-009 | не обсуждается | **Не включался в повторный аудит** |
| AUD-010 | исправлен | **Подтверждено: введён AsyncPool** |
| AUD-011 | logger/single-runner semantics | **Есть то же возражение по observability/error contract** |
| AUD-012 | исправлен | **Основной defect исправлен** |
| AUD-013 | сделано намеренно | **Принято, но обнаружена проблема cross-platform orchestration** |
| AUD-014 | исправлен | **Подтверждено: BaseMediator теперь generic/typed** |
| AUD-015 | исправлен | **Основной lifecycle defect устранён** |
| AUD-016 | сделано намеренно | **Принято как domain/UX решение** |
| AUD-017 | исправлен | **В текущей проверенной версии старый cache defect не подтверждён** |
| AUD-018 | выбор fetch/axios позже | **Принято; не является текущим defect** |
| AUD-019 | отдельная задача тестовой инфраструктуры | **Не считается закрытым; текущая реализация расходится с принятыми решениями** |
| AUD-020 | исправлен | **Основной defect закрыт** |

# 3. Возражения по принятым решениям

## AUD-002 / AUD-011 — best-effort sync не должен быть неотличим от полного успеха

**Severity: High**

Предыдущее решение правильно разделяет обычное логирование, safe/best-effort обработку и retry/single-runner semantics. С этим разделением возражений нет.

Возражение относится к следующему утверждению: если операция best-effort, достаточно вернуть обычный 200 OK и записать отдельные ошибки в log.

Текущий код Program.Update() декорирован LogSafe, а ActionController после await program.Update() возвращает c.json("OK", 200). Никакой информации о результате обработки вызывающему коду не передаётся.

### Более серьёзная проблема

ExecUsers() делает Promise.all(users.map(user => ExecUser(user, false))), но ExecUser() не является Safe-операцией.

Следовательно:

- ошибка отдельного user может отклонить общий Promise.all;
- остальные уже запущенные user operations не отменяются;
- внешний LogSafe превращает итоговую ошибку в null;
- HTTP всё равно возвращает 200 OK.

Получается неявная смесь двух моделей:

per-item best effort + whole-operation hidden failure.

### Рекомендация

Сохранить best-effort подход, если он действительно является требованием, но сделать результат явным, например:

processed / failed / errors.

Тогда 200 может оставаться корректным для best-effort operation, UI/API получает информацию о partial failure, лог остаётся диагностическим каналом, а HTTP-контракт не обязан трактовать любой 200 как «всё успешно».

Это возражение не требует отказа от Safe. Оно требует убрать двусмысленность между «операция завершилась» и «все элементы обработаны успешно».

# 4. Новые глубокие находки

## AUD-R2-001 — Тестовая архитектура принята как Jest, но реализована через Node test runner

**Severity: High**

В docs/tasks/AUD-019/questions.md явно выбран Jest. То же самое указано в docs/tasks/AUD-019/project-config.json и docs/tasks/AUD-019/AUD-019-02-Shared-Tests.md.

Однако текущий root script test:shared:utils использует tsx --test packages/shared/src/utils/logger-singleRunner.test.ts, то есть Node.js native test runner.

Сам тест использует node:test и node:assert/strict.

### Почему это важно

Это не просто различие синтаксиса. От выбранного runner зависят test discovery, configuration, mocks, coverage, reporters, test environments, package isolation, CI commands и будущие integration/E2E conventions.

Сейчас документация и фактическая инфраструктура описывают разные системы.

### Вывод

Решение AUD-019 ещё не реализовано в соответствии с принятым архитектурным выбором.

### Рекомендация

До написания большого количества тестов определить единый источник истины: Jest — и привести к нему test files, directory layout, root scripts, coverage, CI и documentation.

Не следует строить полноценную Jest-архитектуру поверх текущего tsx --test только потому, что первый тест уже написан.

## AUD-R2-002 — Первый shared test размещён в production source directory

**Severity: High**

Файл packages/shared/src/utils/logger-singleRunner.test.ts находится внутри production source tree.

При этом принятая архитектура AUD-019 говорит о tests/unit/shared/ и tests/integration/shared/, то есть тесты должны находиться вне production-кода.

Это также объясняет изменение packages/client/tsconfig.base.json, где появилось exclude: src/**/*.test.ts.

### Почему это плохой сигнал

Тест был помещён внутрь src, а затем production typecheck пришлось специально учить игнорировать test files.

Получилась цепочка:

test находится в src → client видит shared через symlink → client typecheck видит test → test исключается из tsconfig.

Это лечит симптом, но не архитектурную причину.

### Рекомендация

Перенести тест в выбранную AUD-019 тестовую структуру и настроить test runner так, чтобы production tsconfig не должен был знать о тестах; тесты не должны исключаться из production source через специальные glob; CI запускает тесты отдельной командой; test discovery определяется Jest configuration.

Это особенно важно, потому что именно этот вопрос уже был явно выбран в AUD-019.

## AUD-R2-003 — AUD-019 пока не предоставляет обещанный CI contract

**Severity: High**

Текущий workflow .github/workflows/typecheck.yml выполняет:

1. checkout;
2. Node 22;
3. npm ci;
4. npm run link:shared;
5. npm run typecheck;
6. npm run test:shared:utils.

Это уже рабочий минимальный CI.

Однако принятый AUD-019 contract требует:

install → typecheck → test → coverage → lint → build

и npm run ci как локальный единый entry point.

Сейчас root package.json не содержит ci, coverage или lint pipeline.

### Вывод

Это не defect самого typecheck workflow. Это незавершённость AUD-019.

### Рекомендация

Не расширять существующий workflow случайными шагами. Сначала реализовать принятый CI contract в root scripts, затем сделать GitHub/GitLab orchestration поверх него.

## AUD-R2-004 — CI запускает конкретный shared test, а не архитектурный test contract

**Severity: Medium**

Сейчас CI содержит отдельный запуск npm run test:shared:utils.

Это нормально как временный smoke test.

Но если оставить такой подход, каждый новый package/test suite будет добавляться непосредственно в workflow.

Это противоречит выбранному решению: root ci оркестрирует проверки пакетов.

### Рекомендация

После создания Jest architecture CI должен знать только npm run ci, а не внутренние test suites.

## AUD-R2-005 — Embedding incremental sync исправлен, но API всё ещё передаёт vector дважды

**Severity: Medium / Performance**

AUD-004 действительно исправлен: embeddings.updatedAt сохраняется в IndexedDB и используется как watermark.

AUD-005 также исправлен: modelname теперь участвует в SQL filter.

Но архитектура sync сейчас делает:

1. GET /embeddings/query?updateat=..., который возвращает полный embedding vector.
2. Для каждой затронутой session GET /embeddings/session/{id}, который снова возвращает embeddings.

Таким образом один и тот же vector может пройти через browser дважды.

При больших embeddings это увеличивает network traffic, JSON parsing, browser memory, GC и latency.

### Рекомендация

Разделить API semantics:

/embeddings/query → metadata only: sessionId, modelName, createdAt, dimension.
/embeddings/session/{id} → full vectors.

Тогда incremental sync будет incremental не только по количеству записей, но и по объёму передаваемых данных.

## AUD-R2-006 — Incremental watermark основан на createdAt, что требует явного ordering contract

**Severity: Medium**

Cursor embeddings.updatedAt строится по максимальному embedding.createdAt, а server query использует createdAt > cursor.

Это корректно только если createdAt является монотонным sync-order field.

Если поздно записанный embedding может получить createdAt меньше уже сохранённого watermark, он больше никогда не попадёт в следующий query.

### Рекомендация

Зафиксировать invariant: createdAt устанавливается в момент записи embedding и не может быть меньше текущего sync watermark.

Либо использовать отдельный server-side monotonic cursor: sequence, updated_at + id, version или иной устойчивый ordering key.

## AUD-R2-007 — Shared symlink решение намеренное, но root command не является cross-platform

**Severity: Medium**

Решение AUD-013 использовать symlink/junction вместо workspace package принято и само по себе не оспаривается.

Однако root script link:shared всегда вызывает bash ./scripts/link-shared.sh. При этом рядом существует scripts/link-shared.cmd для Windows.

Получается: Linux/CI использует .sh; Windows implementation существует; npm root command всё равно принудительно вызывает bash.

На обычной Windows-машине без установленного bash npm run link:shared может завершиться ошибкой.

### Рекомендация

Оставить symlink/junction решение, но сделать entry point cross-platform: либо Node.js script, либо platform-aware npm scripts, либо явно документировать обязательный Bash dependency.

Предпочтителен Node.js script, поскольку он не добавляет shell dependency в development environment.

## AUD-R2-008 — IndexedDB migration strategy потенциально разрушительна

**Severity: Medium**

Файл packages/client/src/core/data/IndexDb/Database.ts.

При onupgradeneeded текущая реализация удаляет любой object store, которого нет в текущем конфиге.

Это означает, что изменение конфигурации таблиц может физически удалить локальное хранилище.

Для IndexedDB это может уничтожить локальные пользовательские данные, позиции, embeddings, graph state и будущие данные миграций.

### Рекомендация

Перейти от модели «database config = complete authoritative schema» к явным migration operations: upgrade(version) → createStore → createIndex → migrateData → deleteStore.

Удаление store должно быть осознанной migration operation, а не автоматическим diff текущей конфигурации.

## AUD-R2-009 — IndexedDB schema version не защищает от изменения semantics без migration

**Severity: Medium**

PointDB использует фиксированный version number 5. Database выполняет schema reconciliation только при onupgradeneeded.

Следовательно, изменение keyPath, index, data shape или store semantics без увеличения version не будет обработано существующим браузером.

### Рекомендация

Считать изменение IndexedDB schema migration event и обязательно: увеличить version, описать migration, проверить existing user data и добавить regression test для migration.

## AUD-R2-010 — Action API документирует 404, которого route не возвращает

**Severity: Low**

В ActionController оба endpoint объявляют response 404 «Не найдено», но implementation не имеет соответствующего branch.

Это не runtime defect, но OpenAPI contract содержит response, который не соответствует фактическому behavior.

### Рекомендация

Либо удалить 404 из schema, либо реализовать condition, который действительно может привести к 404.

## AUD-R2-011 — Error response schemas не унифицированы

**Severity: Low / Medium**

В BaseController существует ErrorResponseSchema, но controllers при exception используют { error: "Internal server error" } без общего response schema в каждом route.

В результате часть OpenAPI contract формализована, а часть error contract остаётся только в implementation.

### Рекомендация

Ввести единый error response schema и использовать его во всех routes: 400, 404, 409, 500 — только там, где они действительно возможны.

# 5. Что после повторного аудита считаю закрытым

Не повторяю детальный разбор следующих вопросов, поскольку текущий код подтверждает заявленное решение.

### AUD-001

Root release command теперь использует корректные build:client:release и build:server:release.

### AUD-004

Watermark embeddings теперь хранится в IndexedDB как embeddings.updatedAt и используется при следующем sync.

### AUD-005

modelname теперь участвует в SQL filter.

### AUD-010

File download теперь использует AsyncPool(4) вместо неограниченного запуска всех file operations одновременно.

### AUD-012

DB commands теперь идут через npm --workspace server.

### AUD-014

BaseMediator теперь параметризован BaseMediator<TEventMap>, и event/state API типизирован.

### AUD-015

Основной lifecycle cleanup в актуальной архитектуре улучшен.

### AUD-017

Старый defect с cached targetDistSq в проверенном текущем пути больше не подтверждается.

### AUD-020

README был актуализирован относительно текущего состояния проекта.

# 6. Отдельный вывод по AUD-019

AUD-019 сейчас находится в переходном состоянии.

Уже существует реальный CI:

push / PR → Ubuntu + Node 22 → npm ci → link shared → typecheck → shared tests.

Это хороший первый эксперимент.

Но он пока не является реализацией принятой архитектуры AUD-019.

Главное расхождение:

Документ: Jest, tests/, coverage, lint, npm run ci, GitHub CI, GitLab CI.

Код: Node native test runner, test inside src/, typecheck workflow, один shared test command.

Поэтому я не предлагаю сейчас расширять текущий workflow большим количеством случайных шагов.

Сначала нужно реализовать архитектурный контракт AUD-019, после чего CI должен стать тонким orchestration layer.

# 7. Приоритет новых замечаний

## P0 / P1

### 1. AUD-R2-001 + AUD-R2-002

Привести тестовую инфраструктуру к принятому Jest + tests/ architecture. Это наиболее важное замечание, потому что дальнейшие тестовые задачи могут быть построены на неправильном основании.

### 2. AUD-R2-003

Сформировать единый CI contract. npm run ci должен стать реальной точкой входа.

### 3. AUD-002 / AUD-011 objection

Определить observable result best-effort sync. Не обязательно менять Safe, но нужно отличать completed от all items succeeded.

### 4. AUD-R2-005

Разделить embedding metadata query и full vector query. Это уже вопрос масштабирования, а не только архитектурной красоты.

## P2

5. Зафиксировать ordering invariant watermark.
6. Сделать shared linking cross-platform.
7. Перейти к явным IndexedDB migrations.
8. Унифицировать OpenAPI error responses.
9. Привести action response declarations в соответствие с реальным behavior.

# 8. Итог повторного аудита

Повторная проверка показывает хороший прогресс: значительная часть первоначальных замечаний действительно исправлена, а решения AUD-006, AUD-007, AUD-013, AUD-016 и AUD-018 имеют понятное обоснование и не требуют пересмотра.

При этом обнаружилась важная закономерность: часть проблем предыдущего аудита была устранена на уровне отдельных компонентов, но новые изменения начали формировать следующий архитектурный слой.

Главный пример — AUD-019.

Сейчас уже есть CI, tests, typed mediator, incremental watermark и bounded concurrency, но ещё нет единого контракта, связывающего эти элементы.

Особенно важно не повторить ситуацию:

тест положили в src → typecheck начал видеть тест → тест исключили из tsconfig.

Вместо этого целевая модель должна быть:

production code → typecheck

tests → Jest → coverage → CI.

Поэтому дальнейшая работа должна прежде всего закрепить границы и контракты, а не просто добавлять ещё отдельные проверки.

# 9. Ограничения

Аудит выполнен статически по текущей ветке dev.

Не выполнялись: browser runtime, PostgreSQL runtime, реальные DeepSeek/LM Studio запросы, нагрузочное тестирование, измерение фактического network payload embeddings, запуск GitHub Actions из этого аудита и Windows native environment.

Поэтому performance-выводы по embedding payload и cross-platform замечания являются выводами из текущего кода и orchestration configuration и требуют runtime validation перед окончательным закрытием соответствующих задач.