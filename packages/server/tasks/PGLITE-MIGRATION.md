# Task: постепенный переход runtime БД с PostgreSQL на PGlite

## Цель

Постепенно перевести `packages/server` на **PGlite + Drizzle ORM** как основной runtime database, не разрушая существующую PostgreSQL/Docker систему до тех пор, пока новый путь не будет проверен на реальных SQLite snapshot.

Целевая runtime-архитектура:

    Application
         ↓
       Drizzle
         ↓
    PGlite (in-memory)
         ↓
      Database

При этом:

- **PGlite** — основной runtime database, работающий в памяти;
- **SQLite** — persistent snapshot / backup / interchange format;
- **Docker PostgreSQL** — существующий рабочий backend, fallback и источник bootstrap на переходном этапе.

SQLite **не является runtime database**. После загрузки snapshot в PGlite обычные запросы приложения идут только в PGlite.

## Ключевые архитектурные правила

### 1. Миграция должна быть постепенной

Нельзя начинать задачу с удаления Docker PostgreSQL lifecycle.

Существующая PostgreSQL система содержит рабочие данные и должна оставаться полностью работоспособной на переходном этапе.

Порядок:

    Existing PostgreSQL/Docker
            ↓
    current database state → SQLite snapshot
            ↓
    проверка нескольких snapshot-файлов
            ↓
    SQLite → PGlite (in-memory)
            ↓
    Drizzle + PGlite
            ↓
    реальная эксплуатация
            ↓
    только после подтверждения стабильности
    постепенное отключение PostgreSQL/Docker

Удаление или отключение PostgreSQL lifecycle является **финальной отдельной вехой**, а не частью первой реализации.

### 2. PGlite всегда создаётся in-memory

PGlite в целевой архитектуре не должен использовать persistent PostgreSQL data directory.

Не создавать основной runtime storage вида:

    ./data/pglite

Persistent состояние хранится в SQLite snapshots.

При запуске:

    create PGlite in memory
            ↓
    restore SQLite snapshot
            ↓
    Drizzle + PGlite

### 3. Drizzle — единый ORM для обоих backend

Drizzle не должен быть привязан к конкретному сценарию backup/restore.

До создания ORM выбирается database backend:

    PGlite
       ↓
    drizzle-orm/pglite
       ↓
    Drizzle ORM

или:

    PostgreSQL
       ↓
    pg Pool / существующий PostgreSQL connection
       ↓
    drizzle-orm/node-postgres
       ↓
    Drizzle ORM

Repository и application code должны использовать единый Drizzle-facing database layer.

Если PGlite restore успешен, создаётся Drizzle поверх PGlite.

Если PGlite restore не удался, PGlite закрывается, запускается/используется существующий PostgreSQL lifecycle, после чего создаётся Drizzle поверх PostgreSQL.

Нельзя оставлять приложение в смешанном состоянии, где часть запросов идёт через PGlite, а часть через PostgreSQL.

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

Эта система является **рабочим fallback/backend источником** и не должна удаляться до завершения переходных проверок.

## Целевая схема запуска

### Успешный SQLite restore

    START SERVER
          ↓
    Create PGlite in memory
          ↓
    Find SQLite snapshot
          ↓
    Restore SQLite → PGlite
          ↓
    Restore successful
          ↓
    Create Drizzle(PGlite)
          ↓
    APPLICATION

SQLite загружается в PGlite **один раз при старте**. После этого обычные reads/writes не обращаются к SQLite.

### SQLite snapshot отсутствует или restore завершился ошибкой

    START SERVER
          ↓
    Create PGlite in memory
          ↓
    SQLite snapshot missing/invalid/incompatible/restore failed
          ↓
    Close PGlite
          ↓
    Existing PostgreSQL/Docker lifecycle
          ↓
    PostgreSQL
          ↓
    Create Drizzle(PostgreSQL)
          ↓
    APPLICATION

Не продолжать работу с частично восстановленным PGlite.

### Bootstrap snapshot после fallback

Если SQLite snapshot отсутствует или оказался непригодным:

    PostgreSQL
          ↓
    create snapshot from current database state
          ↓
    validate snapshot
          ↓
    create fresh PGlite in memory
          ↓
    restore SQLite → PGlite
          ↓
    Create Drizzle(PGlite)

Здесь PostgreSQL — только конкретный источник текущего состояния. Backup writer не должен содержать отдельную бизнес-реализацию «PostgreSQL backup».

## SQLite snapshot / backup

SQLite является **persistent snapshot**, а не database runtime.

### Источник snapshot

Архитектурно backup создаётся не «из PostgreSQL» и не «из PGlite». Он создаётся из **текущего состояния database runtime**.

Drizzle является ORM/query layer приложения, но не самим хранилищем данных. Поэтому backup layer должен зависеть от минимальной абстракции чтения PostgreSQL-совместимой базы, а не от конкретного backend.

Концептуально:

    PostgreSQL connection ──┐
                            ├──→ Database snapshot source
    PGlite connection ──────┘              ↓
                                  SQLiteBackupWriter
                                           ↓
                                     SQLite snapshot

Должна существовать **одна реализация создания SQLite snapshot**. Она не должна дублироваться в виде отдельных `createBackupFromPostgres()` и `createBackupFromPGlite()` с разной логикой.

Различаться может только предоставленный snapshot source:

- PostgreSQL connection — на переходном/fallback этапе;
- PGlite connection — в целевом runtime.

Таким образом, при переходе на PGlite механизм backup продолжает работать без изменения своей семантики: после успешной крупной операции он снимает snapshot с текущей PGlite database.

Не следует делать backup буквально «из Drizzle». Drizzle должен оставаться ORM для application/repository queries; backup infrastructure должна использовать общий низкоуровневый query source, чтобы явно контролировать PostgreSQL-специфичные преобразования UUID, JSON/JSONB, BYTEA, timestamps и embedding.

### Требования к snapshot

Backup должен:

- содержать логические данные приложения;
- быть независимым от внутренних файлов PostgreSQL;
- быть независимым от внутренних файлов PGlite;
- иметь явно определённый и версионированный формат;
- проверяться перед restore;
- позволять повторно восстановить данные в чистый PGlite;
- сохраняться атомарно, чтобы не потерять рабочие snapshots при сбое во время записи.

### Rolling snapshots

Snapshot не должен быть единственным постоянно перезаписываемым файлом.

Хранить несколько последних успешных snapshots, например:

    backup/
        backup-<timestamp-1>.sqlite
        backup-<timestamp-2>.sqlite
        backup-<timestamp-3>.sqlite
        backup-<timestamp-4>.sqlite
        backup-<timestamp-5>.sqlite

Целевое правило: **хранить максимум 5 последних успешных SQLite snapshots**. После успешной записи и validation нового snapshot удалить более старые файлы.

Критически важно: старые snapshots нельзя удалять до того, как новый snapshot полностью записан и проверен. Если создание нового snapshot завершилось ошибкой, предыдущие рабочие snapshots должны остаться доступными.

При startup необходимо иметь возможность выбрать пригодный snapshot для restore. Если самый свежий snapshot повреждён или несовместим, runtime должен иметь возможность перейти к более старому пригодному snapshot либо использовать PostgreSQL fallback, согласно startup policy.

### Атомарная запись

Рекомендуемая схема записи каждого snapshot:

    new snapshot
         ↓
    temporary SQLite file
         ↓
    validate
         ↓
    atomic rename
         ↓
    current snapshot set
         ↓
    remove snapshots older than retention limit

Не перезаписывать единственный рабочий backup напрямую.

### Когда создаётся snapshot

Snapshot создаётся после завершения двух крупных операций проекта:

1. **action update** — получение/обновление данных с сервера;
2. **action embedding** — выполнение embedding для данных.

Обе операции могут выполняться редко, например раз в несколько дней, и являются крупными длительными операциями.

После успешного завершения соответствующей операции:

    action update
          ↓
    database updated
          ↓
    SQLite snapshot

или:

    action embedding
          ↓
    embeddings updated
          ↓
    SQLite snapshot

Backup не является обычным периодическим cron backup.

Snapshot должен отражать завершённое согласованное состояние базы после соответствующей операции.

### Стратегия сохранения после runtime-записи

Точный механизм сохранения SQLite snapshot для других операций записи должен быть определён отдельно, если такие операции существуют.

Не предполагать заранее автоматическое сохранение после каждой записи: рабочая нагрузка проекта характеризуется большим количеством чтений и крайне редкими записями.

## Binary COPY: проверка передачи больших и бинарных данных

Для миграции и тестирования больших данных использовать **PostgreSQL binary COPY**, а не text/CSV COPY.

Причина:

- данные приложения могут содержать большие SVG и другие большие текстовые блоки;
- текст может содержать кавычки, апострофы, обратные слэши, `&`, XML/HTML-разметку;
- возможны переводы строк, табуляции, Unicode, emoji и другие символы;
- бинарные данные могут содержать любые байты, включая `0x00`, `0x80` и `0xFF`;
- text/CSV формат требует экранирования и создаёт дополнительный риск ошибок на границе кодировок и разделителей.

### Что было проверено

Добавлен интеграционный тест:

    JavaScript values
          ↓
    pg-copy-streams-binary
          ↓
    PostgreSQL binary COPY stream
          ↓
    Blob
          ↓
    PGlite COPY ... WITH (FORMAT binary)
          ↓
    SELECT
          ↓
    сравнение исходных и восстановленных данных

Тест проверяет одновременно:

- integer;
- большой текстовый блок SVG;
- кавычки, апострофы, обратные слэши и XML-символы;
- переводы строк и табуляции;
- Cyrillic, Japanese, Greek, Arabic и emoji;
- произвольные BYTEA-байты;
- несколько десятков строк;
- сохранение порядка и содержимого после binary COPY.

### Важный вывод из ошибки теста

При первом прохождении CI binary COPY корректно передал данные, но assertion для `BYTEA` завершился ошибкой.

Фактические байты `actual` и `expected` были одинаковыми. Отличалось только представление:

    actual   → Uint8Array
    expected → Node.js Buffer

`assert.deepEqual()` в Node.js различает эти типы, поэтому одинаковое бинарное содержимое не считается равным автоматически.

Следствие:

> При проверке бинарных данных нельзя считать совпадение JavaScript-типа контейнера частью database compatibility contract, если backend/API может возвращать совместимый typed-array тип.

Тест должен нормализовать фактическое значение перед сравнением:

    PGlite BYTEA result
          ↓
    Buffer.from(...)
          ↓
    compare bytes with expected Buffer

При этом **не следует приводить данные к строке** или сравнивать их через текстовое представление. Проверять необходимо именно последовательность байтов.

### Требования к binary COPY

При реализации production backup/restore:

- не переходить на CSV/text COPY только ради простоты;
- использовать binary COPY там, где необходимо переносить большие текстовые и бинарные поля;
- явно проверять типы PostgreSQL, участвующие в binary COPY;
- отдельно проверять `BYTEA`;
- отдельно проверять большие `TEXT` значения;
- сохранять байтовое содержимое без преобразования через UTF-8/string;
- в тестах нормализовать `Buffer`/`Uint8Array` перед сравнением бинарного содержимого;
- assertion должен сообщать, какая строка и какое поле не прошли проверку;
- сообщения assertions должны объяснять семантику проверки, а не оставлять только неинформативные `actual/expected`.

### Ограничение тестовой интеграции

PGlite не предоставляет Node.js `pg-copy-streams` wire-stream API. Поэтому текущий тест проверяет именно:

    pg-copy-streams-binary rowWriter
          ↓
    complete PostgreSQL binary COPY payload
          ↓
    PGlite /dev/blob
          ↓
    COPY FROM ... FORMAT binary

Это является полноценной проверкой совместимости **binary COPY payload с PGlite**, но не заменяет отдельный тест настоящего `pg-copy-streams` Node/PostgreSQL network stream.

Если в дальнейшем потребуется проверить именно network COPY через `pg-copy-streams`, такой тест должен выполняться против реального PostgreSQL backend.

## Этапы миграции

### Этап 1 — PostgreSQL остаётся полностью рабочим

Не менять существующий Docker/PostgreSQL lifecycle.

Проверить и зафиксировать текущий путь:

    Docker PostgreSQL
          ↓
    pg Pool
          ↓
    Drizzle
          ↓
    Repository

На этом этапе задача не должна удалять `DbManager`, Docker Compose или PostgreSQL data directory.

### Этап 2 — current database → SQLite snapshot

Добавить надёжный механизм создания SQLite snapshot из текущего database source.

Проверить:

- все таблицы;
- все данные;
- UUID;
- composite primary keys;
- foreign keys;
- `ON DELETE CASCADE`;
- timestamps/timezone;
- JSON/JSONB;
- BYTEA;
- numeric/integer/real/double precision/varchar;
- indexes, если они являются частью snapshot contract;
- embeddings;
- необходимые metadata/version information.

На этом этапе PostgreSQL продолжает оставаться рабочим runtime/fallback.

### Этап 3 — Несколько независимых SQLite snapshots

До переключения runtime необходимо получить **несколько SQLite snapshot-файлов**, созданных в разные моменты после реальных операций проекта.

Для каждого snapshot проверить:

- файл открывается;
- формат/version валиден;
- schema совместима;
- количество и состав данных ожидаемы;
- ключевые repository queries дают корректные результаты после restore;
- embeddings восстанавливаются;
- foreign keys и связи сохраняются;
- snapshot можно повторно использовать для restore.

Критерий перехода дальше:

> На руках должны находиться несколько реально созданных SQLite snapshots, и каждый из них должен быть успешно проверен восстановлением.

Одного успешно созданного snapshot недостаточно для решения об отключении PostgreSQL.

### Этап 4 — SQLite → PGlite in-memory

Добавить PGlite как runtime backend:

    SQLite snapshot
          ↓
    PGlite in memory
          ↓
    Drizzle
          ↓
    Repository

Проверить restore каждого подготовленного SQLite snapshot в новый чистый PGlite instance.

Каждый тест должен начинаться с нового PGlite instance, чтобы исключить случайное использование состояния предыдущего запуска.

### Этап 5 — Runtime selection и fallback

Реализовать startup decision:

    create PGlite in memory
             ↓
    attempt SQLite restore
          /       \\
       success    failure
         ↓          ↓
    Drizzle      close PGlite
    (PGlite)          ↓
                  PostgreSQL
                      ↓
                  Drizzle
                  (PostgreSQL)

Ошибки отсутствующего, повреждённого или несовместимого snapshot должны приводить к PostgreSQL fallback, если пригодного snapshot не найдено.

Не использовать частично восстановленный PGlite.

### Этап 6 — Реальная эксплуатация PGlite

После успешной проверки нескольких snapshots сервер может использовать PGlite как основной runtime.

При этом PostgreSQL/Docker ещё **не удаляется**.

PostgreSQL остаётся аварийным fallback и источником данных до тех пор, пока PGlite + SQLite путь не будет подтверждён эксплуатацией.

При успешных `action update` и `action embedding` создаются новые rolling snapshots уже из текущего PGlite runtime.

### Этап 7 — Постепенное отключение PostgreSQL

Только после выполнения всех предыдущих этапов и подтверждения стабильности:

- сначала перестать использовать PostgreSQL в обычном startup path;
- затем оставить его как явно включаемый fallback;
- затем отдельно оценить необходимость Docker lifecycle;
- только после этого удалить/отключить ненужный Docker/PostgreSQL code.

Это отдельная задача/веха, а не скрытая часть первоначальной миграции.

## Требования к backup/restore

Определить и реализовать:

- единую операцию создания SQLite snapshot из абстрагированного текущего database source;
- операцию проверки snapshot;
- операцию восстановления SQLite → PGlite;
- версию формата snapshot;
- schema compatibility check;
- атомарность создания snapshot;
- rolling retention последних 5 успешных snapshots;
- правила преобразования PostgreSQL/PGlite типов в SQLite и обратно;
- обработку UUID;
- timestamps/timezone;
- JSON/JSONB;
- BYTEA;
- embedding vectors;
- composite keys;
- foreign keys;
- поведение при конфликте с существующими данными;
- поведение при повреждённом snapshot;
- поведение при несовместимой версии;
- проверку snapshot до изменения целевой БД.

Restore должен быть безопасным относительно частичного выполнения. При ошибке нельзя оставлять приложение работающим на частично восстановленных данных.

## Проверка совместимости схемы и запросов

До переключения runtime проверить существующую Drizzle-схему и реальные repository queries.

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

Текущая схема содержит PostgreSQL-specific views, включая `percentile_cont`, `format`, casts и `FULL JOIN`. Для каждого view определить, может ли он работать в PGlite или должен быть адаптирован/перенесён на уровень repository/service.

Не переводить рабочую database schema на SQLite-синтаксис. SQLite используется только как backup/interchange format.

## Embeddings

Сейчас embedding vectors хранятся как `jsonb`.

На первом этапе сохранить существующий формат для минимальной миграции.

Отдельно исследовать:

1. бинарное хранение (`bytea` / Float32Array serialization);
2. доступность и целесообразность `pgvector` в используемой версии PGlite.

Не менять формат embeddings без необходимости для этой миграции.

## Drizzle

Drizzle должен поддерживать два database initialization paths:

    Drizzle(PGlite)

и:

    Drizzle(PostgreSQL)

Использовать:

- `drizzle-orm/pglite` для PGlite;
- существующий `drizzle-orm/node-postgres` для PostgreSQL fallback.

Schema и repository API не должны дублироваться только из-за выбора backend.

Проверить:

- `drizzle-kit generate`;
- `drizzle-kit migrate`;
- `drizzle-kit push`;
- `drizzle-kit studio`, если необходимый сценарий поддерживается;
- transactions;
- реальные repository queries.

## PostgreSQL fallback

Существующий `DbManager` и Docker lifecycle должны оставаться рабочими до отдельной финальной вехи отключения.

Fallback должен:

- запускать существующий PostgreSQL backend;
- дождаться `pg_isready`;
- создать PostgreSQL connection;
- создать Drizzle(PostgreSQL);
- продолжить работу приложения без изменения HTTP API.

Не удалять PostgreSQL fallback только потому, что PGlite стал основным runtime.

## Существующие данные

Нельзя открывать существующий `./data/postgres` как PGlite data directory.

Существующие PostgreSQL данные переходят через логический snapshot:

    PostgreSQL
        ↓
    SQLite
        ↓
    PGlite in memory

Текущий PostgreSQL data directory должен оставаться нетронутым на переходном этапе.

## Инициализация сервера

Целевой startup должен учитывать оба пути.

Успех PGlite:

    InitDbAsync
      ↓
    create PGlite in memory
      ↓
    restore SQLite
      ↓
    create Drizzle(PGlite)
      ↓
    Repository
      ↓
    Application

Fallback:

    InitDbAsync
      ↓
    create PGlite in memory
      ↓
    restore failed
      ↓
    close PGlite
      ↓
    DbManager / PostgreSQL lifecycle
      ↓
    create Drizzle(PostgreSQL)
      ↓
    Repository
      ↓
    Application

Проверить порядок инициализации относительно `Program`, `EmbedderLmStudio`, HTTP API, repository и migrations.

## Transactions и конкурентный доступ

Проверить все места использования Drizzle transactions.

PGlite должен использоваться как один общий database instance процесса.

Проверить, что код не предполагает:

- несколько независимых PGlite instances;
- PostgreSQL connection pooling внутри PGlite runtime;
- параллельные транзакции через разные pool connections;
- PostgreSQL-specific locking semantics, отсутствующие или отличающиеся в PGlite.

PostgreSQL fallback может продолжать использовать существующий `pg.Pool`.

## Зависимости и команды

На переходном этапе не удалять зависимости, необходимые PostgreSQL fallback.

После финального отключения PostgreSQL отдельно проверить:

- `packages/server/package.json`;
- `package-lock.json`;
- `pg`;
- `@electric-sql/pglite`;
- Docker scripts;
- `DbManager`;
- `InitDb.ts`;
- `drizzle-db.ts`;
- `drizzle.config.*`;
- `.env`;
- CI/CD.

Удаление PostgreSQL/Docker dependencies выполняется только после финального решения об отключении fallback.

## Обратная совместимость

Переход БД не должен менять публичный HTTP API.

Проверить сохранение поведения:

- DeepSeek synchronization;
- documents/sessions;
- embeddings;
- repository operations;
- существующих API endpoints.

Особенно проверить `action update` и `action embedding`, поскольку после их завершения создаётся новый SQLite snapshot.

## Проверки

### Current database → SQLite

1. Получить текущее согласованное состояние database runtime.
2. Создать SQLite snapshot через единую snapshot operation.
3. Проверить snapshot.
4. Сохранить несколько snapshot-файлов, созданных после разных реальных состояний данных.

На переходном этапе источником может быть PostgreSQL; после переключения runtime источником должен быть PGlite. Логика записи SQLite при этом остаётся одной.

### SQLite → PGlite

Для каждого сохранённого snapshot:

1. создать новый PGlite instance в памяти;
2. выполнить restore;
3. проверить schema;
4. проверить ключевые данные;
5. выполнить реальные repository queries;
6. проверить embeddings;
7. закрыть PGlite.

### Fallback

Проверить отдельно:

- snapshot отсутствует;
- snapshot повреждён;
- snapshot имеет неизвестную версию;
- snapshot несовместим со schema;
- restore завершается ошибкой.

Во всех случаях:

    failed PGlite
         ↓
    close
         ↓
    PostgreSQL
         ↓
    Drizzle(PostgreSQL)
         ↓
    application

### Runtime PGlite

После подтверждения snapshot/restore:

- запустить сервер с валидным SQLite snapshot;
- убедиться, что используется PGlite;
- выполнить реальные repository queries;
- выполнить `action update`;
- выполнить `action embedding`;
- создать новый SQLite snapshot из текущего runtime;
- перезапустить сервер;
- снова восстановить snapshot;
- проверить сохранение данных;
- проверить rolling retention и наличие не более 5 последних успешных snapshots.

### Финальная проверка перед отключением PostgreSQL

До удаления/отключения PostgreSQL необходимо иметь:

- несколько SQLite snapshots, созданных в разные моменты;
- успешный restore каждого snapshot в чистый PGlite;
- успешную работу реального приложения на PGlite;
- проверенный fallback на PostgreSQL;
- проверенный цикл update → snapshot → restart → restore;
- проверенный цикл embedding → snapshot → restart → restore;
- отсутствие потери данных при snapshot failure;
- подтверждение, что SQLite snapshots действительно являются достаточным persistent state.

Только после этого разрешается переходить к постепенному отключению PostgreSQL/Docker.

## README и документация

Документацию обновлять поэтапно.

До финального отключения PostgreSQL **не удалять из документации информацию о PostgreSQL fallback**, если она нужна для запуска/восстановления переходной системы.

После фактического отключения PostgreSQL отдельно обновить:

- требования Docker;
- PostgreSQL port `6000`;
- PGlite runtime;
- SQLite snapshots;
- startup fallback;
- процедуру восстановления;
- database architecture diagram.

## Ограничения

Не делать без отдельного обоснования:

- переход на другую ORM;
- переход приложения на SQLite как runtime database;
- переписывание repository API;
- изменение HTTP API;
- изменение клиентской части;
- удаление Docker/PostgreSQL lifecycle до прохождения всех переходных вех;
- создание persistent PGlite data directory вместо требуемого in-memory runtime;
- одновременную переработку unrelated database code.

Цель — **мягко добавить PGlite in-memory runtime и SQLite persistent snapshots, сохранив существующий PostgreSQL/Docker fallback до полного подтверждения нового пути**.

## Критерии готовности

### Архитектура

- [ ] PGlite используется только как in-memory runtime;
- [ ] SQLite используется как persistent snapshot/backup;
- [ ] PostgreSQL/Docker остаётся рабочим fallback;
- [ ] Drizzle может быть создан поверх PGlite;
- [ ] Drizzle может быть создан поверх PostgreSQL;
- [ ] repository code не зависит от выбранного backend;
- [ ] нет смешанного runtime PGlite/PostgreSQL.

### Snapshot / Backup

- [ ] единая snapshot operation работает с текущим database source;
- [ ] backup не дублирует реализацию отдельно для PostgreSQL и PGlite;
- [ ] SQLite snapshot имеет версию формата;
- [ ] snapshot проходит validation;
- [ ] snapshot записывается атомарно;
- [ ] хранится максимум 5 последних успешных snapshots;
- [ ] SQLite → PGlite реализован;
- [ ] restore не допускает частично используемую БД;
- [ ] UUID/composite keys/foreign keys проверены;
- [ ] JSON/JSONB проверены;
- [ ] timestamps проверены;
- [ ] BYTEA/embeddings проверены;
- [ ] несколько реальных snapshot-файлов созданы;
- [ ] каждый из нескольких snapshot-файлов успешно восстановлен в чистый PGlite.

### Runtime

- [ ] PGlite успешно создаётся в памяти;
- [ ] валидный SQLite snapshot загружается один раз при старте;
- [ ] после restore приложение работает через Drizzle(PGlite);
- [ ] обычные queries не требуют SQLite;
- [ ] `action update` работает;
- [ ] после `action update` создаётся snapshot;
- [ ] `action embedding` работает;
- [ ] после `action embedding` создаётся snapshot;
- [ ] restart → SQLite restore → PGlite проверен;
- [ ] rolling retention оставляет не более 5 последних успешных snapshots.

### Fallback

- [ ] отсутствие пригодного snapshot приводит к PostgreSQL fallback;
- [ ] повреждённый snapshot приводит к PostgreSQL fallback;
- [ ] несовместимый snapshot приводит к PostgreSQL fallback;
- [ ] failed PGlite instance закрывается;
- [ ] PostgreSQL fallback использует существующий lifecycle;
- [ ] PostgreSQL fallback создаёт Drizzle(PostgreSQL).

### PostgreSQL deprecation gate

- [ ] несколько независимых SQLite snapshots успешно проверены;
- [ ] каждый snapshot успешно восстановлен в PGlite;
- [ ] реальные update/embedding циклы проверены;
- [ ] PGlite runtime стабильно работает;
- [ ] fallback проверен;
- [ ] persistent state через SQLite подтверждён;
- [ ] только после этого принято отдельное решение о постепенном отключении PostgreSQL;
- [ ] Docker lifecycle удаляется только отдельным последующим этапом.

## Справочные материалы

- Drizzle: https://orm.drizzle.team/docs/connect-pglite
- Drizzle: https://orm.drizzle.team/docs/get-started/pglite-new
- Drizzle Config: https://orm.drizzle.team/docs/drizzle-config
- PGlite: https://pglite.dev/docs
- PGlite API: https://pglite.dev/docs/api
