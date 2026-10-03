# Task: постепенный переход runtime БД с PostgreSQL на PGlite

## Цель

Постепенно перевести `packages/server` на **PGlite + Drizzle ORM** как основной runtime database, не разрушая существующую PostgreSQL/Docker систему до тех пор, пока новый путь не будет проверен на реальных SQLite backup.

Целевая runtime-архитектура:

    Server
      ↓
    Drizzle ORM
      ↓
    PGlite (in-memory)
      ↓
    application

При этом:

- **PGlite** — основной runtime database, работающий в памяти;
- **SQLite** — persistent snapshot / backup / interchange format;
- **Docker PostgreSQL** — существующий рабочий backend, fallback и источник восстановления на переходном этапе.

SQLite **не является runtime database**. После загрузки snapshot в PGlite обычные запросы приложения идут только в PGlite.

## Ключевые архитектурные правила

### 1. Миграция должна быть постепенной

Нельзя начинать задачу с удаления Docker PostgreSQL lifecycle.

Существующая PostgreSQL система содержит рабочие данные и должна оставаться полностью работоспособной на переходном этапе.

Порядок:

    Existing PostgreSQL/Docker
            ↓
    PostgreSQL → SQLite backup
            ↓
    проверка нескольких backup-файлов
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

Persistent состояние хранится в SQLite backup.

При запуске:

    create PGlite in memory
            ↓
    restore SQLite backup
            ↓
    Drizzle + PGlite

После завершения работы приложения состояние должно сохраняться в SQLite в соответствии с определённой стратегией snapshot.

### 3. Drizzle — единый ORM для обоих backend

Drizzle не должен быть привязан к конкретному сценарию миграции.

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
    Find SQLite backup
          ↓
    Restore SQLite → PGlite
          ↓
    Restore successful
          ↓
    Create Drizzle(PGlite)
          ↓
    APPLICATION

SQLite загружается в PGlite **один раз при старте**. После этого обычные reads/writes не обращаются к SQLite.

### SQLite backup отсутствует или restore завершился ошибкой

    START SERVER
          ↓
    Create PGlite in memory
          ↓
    SQLite backup missing/invalid/incompatible/restore failed
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

Fallback должен быть полным: неудачный PGlite instance закрывается, после чего приложение работает через существующий PostgreSQL backend.

### Первый backup после fallback

Если SQLite backup отсутствовал или оказался непригодным:

    PostgreSQL
          ↓
    create SQLite backup
          ↓
    validate backup
          ↓
    create fresh PGlite in memory
          ↓
    restore SQLite → PGlite
          ↓
    Create Drizzle(PGlite)

Точный момент переключения текущего процесса с PostgreSQL на PGlite должен быть реализован безопасно: не использовать одновременно повреждённый/частично восстановленный PGlite.

## SQLite backup

SQLite является **persistent snapshot**, а не database runtime.

Backup должен:

- содержать логические данные приложения;
- быть независимым от внутренних файлов PostgreSQL;
- быть независимым от внутренних файлов PGlite;
- иметь явно определённый и версионированный формат;
- проверяться перед restore;
- позволять повторно восстановить данные в чистый PGlite;
- сохраняться атомарно, чтобы не потерять последний рабочий snapshot при сбое во время записи.

Рекомендуемая схема записи:

    new snapshot
         ↓
    temporary SQLite file
         ↓
    validate
         ↓
    atomic replace
         ↓
    current SQLite backup

Не перезаписывать единственный рабочий backup напрямую.

### Когда создаётся backup

Backup создаётся после завершения двух крупных операций проекта:

1. **action update** — получение/обновление данных с сервера;
2. **action embedding** — выполнение embedding для данных.

Обе операции могут выполняться редко, например раз в несколько дней, и являются крупными длительными операциями.

После успешного завершения соответствующей операции:

    action update
          ↓
    database updated
          ↓
    SQLite backup

или:

    action embedding
          ↓
    embeddings updated
          ↓
    SQLite backup

Backup не является обычным периодическим cron backup.

Важно: snapshot должен отражать завершённое согласованное состояние базы после соответствующей операции.

### Стратегия сохранения после runtime-записи

Точный механизм сохранения SQLite snapshot для других операций записи должен быть определён отдельно, если такие операции существуют.

Не предполагать заранее автоматическое сохранение после каждой записи: рабочая нагрузка проекта характеризуется большим количеством чтений и крайне редкими записями.

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

### Этап 2 — PostgreSQL → SQLite backup

Добавить надёжный механизм создания SQLite backup из текущего PostgreSQL.

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
- indexes, если они являются частью backup contract;
- embeddings;
- необходимые metadata/version information.

На этом этапе PostgreSQL продолжает оставаться рабочим runtime.

### Этап 3 — Несколько независимых SQLite backup

До переключения runtime необходимо получить **несколько SQLite backup-файлов**, созданных в разные моменты после реальных операций проекта.

Для каждого backup проверить:

- файл открывается;
- формат/version валиден;
- schema совместима;
- количество и состав данных ожидаемы;
- ключевые repository queries дают корректные результаты после restore;
- embeddings восстанавливаются;
- foreign keys и связи сохраняются;
- backup можно повторно использовать для restore.

Критерий перехода дальше:

> На руках должны находиться несколько реально созданных SQLite backup, и каждый из них должен быть успешно проверен восстановлением.

Одного успешно созданного backup недостаточно для решения об отключении PostgreSQL.

### Этап 4 — SQLite → PGlite in-memory

Добавить PGlite как runtime backend:

    SQLite backup
          ↓
    PGlite in memory
          ↓
    Drizzle
          ↓
    Repository

Проверить restore каждого подготовленного SQLite backup в новый чистый PGlite instance.

Каждый тест должен начинаться с нового PGlite instance, чтобы исключить случайное использование состояния предыдущего запуска.

### Этап 5 — Runtime selection и fallback

Реализовать startup decision:

    create PGlite in memory
             ↓
    attempt SQLite restore
          /       \
       success    failure
         ↓          ↓
    Drizzle      close PGlite
    (PGlite)          ↓
                  PostgreSQL
                      ↓
                  Drizzle
                  (PostgreSQL)

Ошибки отсутствующего, повреждённого или несовместимого backup должны приводить к PostgreSQL fallback.

Не использовать частично восстановленный PGlite.

### Этап 6 — Реальная эксплуатация PGlite

После успешной проверки нескольких backup сервер может использовать PGlite как основной runtime.

При этом PostgreSQL/Docker ещё **не удаляется**.

PostgreSQL остаётся аварийным fallback и источником данных до тех пор, пока PGlite + SQLite путь не будет подтверждён эксплуатацией.

### Этап 7 — Постепенное отключение PostgreSQL

Только после выполнения всех предыдущих этапов и подтверждения стабильности:

- сначала перестать использовать PostgreSQL в обычном startup path;
- затем оставить его как явно включаемый fallback;
- затем отдельно оценить необходимость Docker lifecycle;
- только после этого удалить/отключить ненужный Docker/PostgreSQL code.

Это отдельная задача/веха, а не скрытая часть первоначальной миграции.

## Требования к backup/restore

Определить и реализовать:

- операцию создания SQLite backup;
- операцию проверки backup;
- операцию восстановления SQLite → PGlite;
- версию формата backup;
- schema compatibility check;
- атомарность создания backup;
- правила преобразования PostgreSQL/PGlite типов в SQLite и обратно;
- обработку UUID;
- timestamps/timezone;
- JSON/JSONB;
- BYTEA;
- embedding vectors;
- composite keys;
- foreign keys;
- поведение при конфликте с существующими данными;
- поведение при повреждённом backup;
- поведение при несовместимой версии;
- проверку backup до изменения целевой БД.

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

Существующие PostgreSQL данные переходят через логический backup:

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

### PostgreSQL → SQLite

1. Запустить существующую PostgreSQL систему.
2. Создать SQLite backup.
3. Проверить backup.
4. Сохранить несколько backup-файлов, созданных после разных реальных состояний данных.

### SQLite → PGlite

Для каждого сохранённого backup:

1. создать новый PGlite instance в памяти;
2. выполнить restore;
3. проверить schema;
4. проверить ключевые данные;
5. выполнить реальные repository queries;
6. проверить embeddings;
7. закрыть PGlite.

### Fallback

Проверить отдельно:

- backup отсутствует;
- backup повреждён;
- backup имеет неизвестную версию;
- backup несовместим со schema;
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

После подтверждения backup/restore:

- запустить сервер с валидным SQLite backup;
- убедиться, что используется PGlite;
- выполнить реальные repository queries;
- выполнить `action update`;
- выполнить `action embedding`;
- создать новый SQLite backup;
- перезапустить сервер;
- снова восстановить backup;
- проверить сохранение данных.

### Финальная проверка перед отключением PostgreSQL

До удаления/отключения PostgreSQL необходимо иметь:

- несколько SQLite backup, созданных в разные моменты;
- успешный restore каждого backup в чистый PGlite;
- успешную работу реального приложения на PGlite;
- проверенный fallback на PostgreSQL;
- проверенный цикл update → backup → restart → restore;
- проверенный цикл embedding → backup → restart → restore;
- отсутствие потери данных при backup failure;
- подтверждение, что SQLite snapshot действительно является достаточным persistent state.

Только после этого разрешается переходить к постепенному отключению PostgreSQL/Docker.

## README и документация

Документацию обновлять поэтапно.

До финального отключения PostgreSQL **не удалять из документации информацию о PostgreSQL fallback**, если она нужна для запуска/восстановления переходной системы.

После фактического отключения PostgreSQL отдельно обновить:

- требования Docker;
- PostgreSQL port `6000`;
- PGlite runtime;
- SQLite backup;
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

Цель — **мягко добавить PGlite in-memory runtime и SQLite persistent snapshot, сохранив существующий PostgreSQL/Docker fallback до полного подтверждения нового пути**.

## Критерии готовности

### Архитектура

- [ ] PGlite используется только как in-memory runtime;
- [ ] SQLite используется как persistent snapshot/backup;
- [ ] PostgreSQL/Docker остаётся рабочим fallback;
- [ ] Drizzle может быть создан поверх PGlite;
- [ ] Drizzle может быть создан поверх PostgreSQL;
- [ ] repository code не зависит от выбранного backend;
- [ ] нет смешанного runtime PGlite/PostgreSQL.

### Backup

- [ ] PostgreSQL → SQLite backup реализован;
- [ ] SQLite backup имеет версию формата;
- [ ] backup проходит validation;
- [ ] backup записывается атомарно;
- [ ] SQLite → PGlite реализован;
- [ ] restore не допускает частично используемую БД;
- [ ] UUID/composite keys/foreign keys проверены;
- [ ] JSON/JSONB проверены;
- [ ] timestamps проверены;
- [ ] BYTEA/embeddings проверены;
- [ ] несколько реальных backup-файлов созданы;
- [ ] каждый из нескольких backup-файлов успешно восстановлен в чистый PGlite.

### Runtime

- [ ] PGlite успешно создаётся в памяти;
- [ ] валидный SQLite backup загружается один раз при старте;
- [ ] после restore приложение работает через Drizzle(PGlite);
- [ ] обычные queries не требуют SQLite;
- [ ] `action update` работает;
- [ ] после `action update` создаётся backup;
- [ ] `action embedding` работает;
- [ ] после `action embedding` создаётся backup;
- [ ] restart → SQLite restore → PGlite проверен.

### Fallback

- [ ] отсутствие backup приводит к PostgreSQL fallback;
- [ ] повреждённый backup приводит к PostgreSQL fallback;
- [ ] несовместимый backup приводит к PostgreSQL fallback;
- [ ] failed PGlite instance закрывается;
- [ ] PostgreSQL fallback использует существующий lifecycle;
- [ ] PostgreSQL fallback создаёт Drizzle(PostgreSQL).

### PostgreSQL deprecation gate

- [ ] несколько независимых SQLite backup успешно проверены;
- [ ] каждый backup успешно восстановлен в PGlite;
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
