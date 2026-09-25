# Task: перейти с Docker PostgreSQL на встроенный PGlite

## Цель

Убрать необходимость запуска отдельного PostgreSQL-сервиса через Docker Compose и перевести `packages/server` на **PGlite + Drizzle ORM**.

После выполнения сервер должен работать с PostgreSQL-совместимой БД, встроенной непосредственно в Node.js-процесс, а данные должны сохраняться в локальном data directory без Docker.

Целевая архитектура:

    Server
      ↓
    Drizzle ORM
      ↓
    PGlite
      ↓
    локальный data directory

## Текущее состояние

На ветке `dev` база запускается автоматически через `DbManager`.

Фактическая цепочка:

- `packages/server/src/db/db-manager.ts` генерирует `.env` и `postgres_db/docker-compose.yaml`;
- используется `postgres:15`;
- host-порт `6000`, container-порт `5432`;
- база `mydb`, пользователь `postgres`, пароль `postgres`;
- данные монтируются из `./data/postgres` в `/var/lib/postgresql/data`;
- сервер ждёт готовности через `pg_isready`;
- `packages/server/src/db/drizzle/drizzle-db.ts` создаёт `pg.Pool` по `DATABASE_URL`;
- Drizzle подключён через `drizzle-orm/node-postgres`.

То есть уже сейчас постоянные данные фактически находятся в локальном каталоге проекта. Нужно заменить внешний PostgreSQL-процесс на embedded PGlite.

## Требуемое решение

### 1. PGlite + Drizzle

Использовать официальные пакеты `@electric-sql/pglite` и `drizzle-orm/pglite`.

Новый database layer должен иметь один общий экземпляр PGlite на процесс сервера и один экземпляр Drizzle поверх него. Repository не должен создавать собственные PGlite instances.

Не использовать `pg.Pool` для нового подключения и не создавать connection pool.

Пример целевой зависимости:

    PGlite instance
         ↓
    Drizzle
         ↓
    DrizzleRepository
         ↓
    IRepository

### 2. Data directory

Выбрать отдельный каталог PGlite, например `./data/pglite`.

Важно: PGlite хранит PostgreSQL data directory, а не один SQLite-подобный `.db` файл.

Путь должен задаваться конфигурацией, а не быть зашит в repository-код.

### 3. Docker больше не участвует в lifecycle БД

После миграции сервер не должен:

- запускать Docker;
- генерировать PostgreSQL Compose-файл;
- выполнять `pg_isready`;
- останавливать контейнер PostgreSQL при завершении;
- зависеть от наличия Docker для запуска.

Текущий `DbManager` следует удалить или заменить небольшим компонентом конфигурации/lifecycle PGlite, если такой компонент действительно нужен. Не сохранять Docker-логику без потребности.

### 4. Конфигурация

Сейчас `DATABASE_URL` имеет вид PostgreSQL connection string с `localhost:6000`.

Для PGlite сетевой URL не нужен. Рассмотреть однозначную переменную `PGLITE_DATA_DIR`, например `./data/pglite`.

Если `DATABASE_URL` сохраняется ради совместимости, нужно явно определить новую семантику как путь к data directory. В рабочей конфигурации не должно оставаться ложного `localhost:6000`, если Docker PostgreSQL больше не используется.

## Проверка совместимости схемы

До полного удаления PostgreSQL проверить существующую Drizzle-схему и реальные repository queries.

Особенно проверить:

- UUID;
- composite primary keys;
- foreign keys и `ON DELETE CASCADE`;
- `jsonb`;
- `bytea`;
- timestamps/timezone;
- integer, real, double precision, varchar;
- индексы;
- transactions;
- сложные SQL-запросы;
- существующие PostgreSQL views;
- PostgreSQL-specific functions и casts.

Текущая схема содержит PostgreSQL-specific views, включая `percentile_cont`, `format`, casts и `FULL JOIN`. Для каждого view определить: оставить, адаптировать или перенести вычисление в repository/service.

Не переводить схему на SQLite-синтаксис: целевая БД остаётся PostgreSQL-compatible через PGlite.

## Embeddings

Сейчас embedding vectors хранятся как `jsonb`.

Проверить два варианта:

1. сохранить текущий `jsonb` для минимальной миграции;
2. отдельно исследовать бинарное хранение (`bytea` / Float32Array serialization).

Также проверить доступность и целесообразность `pgvector` в используемой версии PGlite.

Не менять формат embedding vectors без необходимости: сначала добиться эквивалентной работы текущего функционала.

## Миграции Drizzle

Сохранить workflow Drizzle и проверить:

- `drizzle-kit generate`;
- `drizzle-kit migrate`;
- `drizzle-kit push`;
- `drizzle-kit studio`, если поддерживаемый сценарий останется нужен.

Для PGlite использовать конфигурацию с `driver: "pglite"` и `dialect: "postgresql"`.

## Существующие данные

Нельзя открывать существующий `./data/postgres` как data directory PGlite.

Если сохранение данных Docker PostgreSQL требуется, определить отдельную процедуру:

    Docker PostgreSQL
          ↓
    SQL dump / export
          ↓
    PGlite

Новый чистый запуск должен создавать новый PGlite data directory и применять актуальную схему/migrations.

## Инициализация сервера

Сейчас:

    InitDbAsync
      ↓
    DbManager.startAndWaitAsync
      ↓
    Docker Compose
      ↓
    pg_isready
      ↓
    DrizzleRepository

После:

    InitDbAsync
      ↓
    create/open PGlite
      ↓
    Drizzle
      ↓
    DrizzleRepository

Проверить порядок инициализации относительно `Program`, `EmbedderLmStudio`, HTTP API, repository и migrations.

## Transactions и конкурентный доступ

Проверить все места использования Drizzle transactions.

Особенно убедиться, что код не предполагает:

- несколько независимых PostgreSQL connections;
- connection pooling;
- параллельные транзакции через разные pool connections;
- PostgreSQL-specific locking semantics.

PGlite должен быть общим экземпляром для database/repository слоя процесса.

## Зависимости и команды

После успешной миграции проверить:

- `packages/server/package.json`;
- `package-lock.json`;
- `pg` — удалить, если больше нигде не используется;
- добавить `@electric-sql/pglite`;
- `npm run docker:up` / `docker:down` — удалить или переопределить, если они больше не нужны;
- `DbManager`;
- `Initdb.ts`;
- `drizzle-db.ts`;
- `drizzle.config.*`;
- `.env`;
- CI/CD.

## Обратная совместимость

Переход БД не должен менять публичный HTTP API.

Проверить сохранение поведения:

- DeepSeek synchronization;
- documents/sessions;
- embeddings;
- repository operations;
- существующих API endpoints.

## Проверки

Минимальный набор:

### TypeScript

    npm run typecheck:server

### Чистая БД

1. удалить/выбрать новый пустой PGlite data directory;
2. запустить сервер;
3. убедиться, что PGlite создаётся;
4. применить schema/migrations;
5. выполнить базовые CRUD и реальные repository queries.

### Перезапуск

    server start
      ↓
    write data
      ↓
    server stop
      ↓
    server start
      ↓
    data remains

### Docker independence

Запустить сервер при недоступном/остановленном Docker и отсутствии PostgreSQL. Сервер должен работать.

### Drizzle

Проверить queries и migrations на PGlite.

### Embeddings

Проверить чтение и запись существующих embedding vectors.

## README и документация

После реализации обновить README:

- убрать требование Docker для PostgreSQL;
- убрать PostgreSQL port `6000` из описания БД;
- описать PGlite;
- указать data directory;
- обновить quick start;
- обновить database architecture diagram;
- описать процедуру переноса существующих данных, если она будет реализована.

## Ограничения

Не делать без отдельного обоснования:

- переход на другую ORM;
- переход на SQLite;
- переписывание repository API;
- изменение HTTP API;
- изменение клиентской части;
- одновременную переработку unrelated database code.

Цель — заменить внешний PostgreSQL service на embedded PGlite с минимальным изменением существующей архитектуры.

## Критерии готовности

- [ ] сервер запускается без Docker;
- [ ] PGlite инициализируется внутри Node.js процесса;
- [ ] Drizzle использует `drizzle-orm/pglite`;
- [ ] используется один общий PGlite instance;
- [ ] данные сохраняются между перезапусками;
- [ ] текущие repository операции работают;
- [ ] migrations/schema workflow работает;
- [ ] transactions проверены;
- [ ] embedding storage проверен;
- [ ] Docker PostgreSQL больше не требуется;
- [ ] старый `pg` driver удалён, если больше не нужен;
- [ ] Docker lifecycle code удалён/заменён;
- [ ] README и конфигурация обновлены;
- [ ] typecheck проходит;
- [ ] проверен запуск с чистым data directory;
- [ ] определена стратегия переноса данных из `./data/postgres`.

## Справочные материалы

- Drizzle: https://orm.drizzle.team/docs/connect-pglite
- Drizzle: https://orm.drizzle.team/docs/get-started/pglite-new
- Drizzle Config: https://orm.drizzle.team/docs/drizzle-config
- PGlite: https://pglite.dev/docs
- PGlite API: https://pglite.dev/docs/api