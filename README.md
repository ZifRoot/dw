# deepseek-w

Система визуализации и навигации по чат-сессиям DeepSeek в виде интерактивного графа.

Сервер синхронизирует историю чатов и файлов с веб-API DeepSeek, хранит данные в PostgreSQL и формирует эмбеддинги через **LM Studio**. Клиент загружает данные через API и отображает сессии как граф точек на 2D/3D SVG-сцене с физической раскладкой на D3.js.

> README описывает фактическое состояние ветки `dev`. Для подробностей о внутренней архитектуре клиента см. `packages/client/README.md`, а для технической карты проекта — `docs/PROJECT_CONTEXT.md`.

## Возможности

- **Синхронизация с DeepSeek** — загрузка истории чат-сессий, сообщений и файлов.
- **Эмбеддинги** — обработка содержимого ответов через embedding-модели, доступные в LM Studio.
- **Визуализация графа** — отображение сессий, рёбер соседства, drag'n'drop и физической раскладки.
- **Локальный кэш** — IndexedDB для таблиц данных и позиций графа.
- **REST API** — API на Hono/OpenAPI, смонтированный в Express, со Swagger UI.
- **Генерация API-клиентов** — клиенты для серверного API генерируются из OpenAPI-спецификации.

## Технологический стек

| Компонент | Технологии |
|-----------|------------|
| **Monorepo** | npm workspaces, TypeScript `^6.0.3` |
| **Server** | Express `^5.2`, Hono `^4.12`, Zod `^4.4`, Drizzle ORM `^0.45`, PostgreSQL 15 |
| **Client** | React `^18.2`, Vite `^4`, D3.js `^7.9`, Axios, Sass |
| **Embeddings** | LM Studio, OpenAI-compatible embeddings API |
| **DevTools** | OpenAPI Generator, drizzle-kit, tsc-alias, tsx |

## Структура проекта

```text
deepseek-w/
├── packages/
│   ├── server/          # API, синхронизация DeepSeek, PostgreSQL, эмбеддинги
│   ├── client/          # React + D3/SVG визуализация
│   └── shared/          # Общие исходники utils; подключаются символическими ссылками
├── generators/
│   ├── dew/             # Генерация клиента API сервера
│   └── embedder/        # Клиент внешнего embedding API
├── scripts/
│   └── link-shared.sh   # Создание символических ссылок на packages/shared/src
├── docs/                # Аудиты и техническая документация
└── .vscode/             # Конфигурации VS Code
```

### Shared

`packages/shared` не является отдельным npm workspace-пакетом. Канонические исходники находятся в `packages/shared/src`, а сервер и клиент получают их через символические ссылки:

```text
packages/shared/src
       ├──→ packages/server/src/shared
       └──→ packages/client/src/shared
```

Перед разработкой необходимо выполнить:

```bash
npm run link:shared
```

Скрипт `scripts/link-shared.sh` рассчитан на Unix-подобную shell-среду. На Windows должен использоваться совместимый Bash (например, Git Bash).

## Быстрый старт

### Требования

- Node.js 18 или новее.
- npm.
- Docker с Docker Compose.
- **LM Studio** с доступной embedding-моделью, если требуется генерация эмбеддингов.
- Bash для запуска `scripts/link-shared.sh`.

### Установка

Клонируйте репозиторий и установите зависимости:

```bash
git clone <repository-url>
cd deepseek-w
npm install
npm run link:shared
```

### Запуск сервера

```bash
npm run debug:server
```

Сервер по умолчанию слушает `127.0.0.1:8081`.

При старте сервер проверяет PostgreSQL. Если база недоступна, `DbManager` генерирует локальные `.env` и Docker Compose-конфигурацию и запускает PostgreSQL 15.

Swagger UI:

```text
http://localhost:8081/api/
```

OpenAPI specification:

```text
http://localhost:8081/api/openapi.json
```

### Запуск клиента

В отдельном терминале:

```bash
npm run debug:client
```

Vite dev-сервер:

```text
http://localhost:3000
```

Клиент проксирует запросы `/api` на `http://localhost:8081/`.

### LM Studio

Текущий сервер использует `EmbedderLmStudio`, а не старый внешний embedding-task сервис.

По умолчанию LM Studio ожидается на:

```text
http://localhost:1234
```

Используемые API:

```text
GET  /api/v1/models
POST /api/v1/models/load
POST /v1/embeddings
```

Сервер выбирает модели с `type: "embedding"`, при необходимости загружает модель и сохраняет полученный вектор в PostgreSQL.

После запуска LM Studio с embedding-моделью генерация выполняется через:

```bash
# в отдельном терминале, когда сервер уже запущен
curl -X POST http://localhost:8081/api/actions/update-embedding
```

> Путь и HTTP-метод API являются частью текущего серверного OpenAPI-контракта. Для интерактивного просмотра используйте Swagger UI.

## Основные команды

### Корень проекта

| Команда | Назначение |
|---------|------------|
| `npm run link:shared` | Создать символические ссылки на `packages/shared/src` |
| `npm run generate:all` | Перегенерировать API-клиенты |
| `npm run generate:dew` | Перегенерировать клиент API сервера |
| `npm run generate:embedder` | Перегенерировать клиент embedding API |
| `npm run debug:server` | Запустить сервер в режиме разработки |
| `npm run debug:client` | Запустить Vite dev-сервер |
| `npm run typecheck` | Проверить типы клиента и сервера |
| `npm run typecheck:client` | Проверить типы клиента |
| `npm run typecheck:server` | Проверить типы сервера |
| `npm run build:release` | Собрать клиент и сервер |
| `npm run release:server` | Собрать и запустить сервер |
| `npm run release:client` | Собрать и запустить клиент |
| `npm run run:release:server` | Запустить уже собранный сервер |
| `npm run run:release:client` | Запустить preview собранного клиента |
| `npm run preview:client` | Запустить Vite preview |
| `npm run db:generate` | Сгенерировать миграции Drizzle |
| `npm run db:migrate` | Применить миграции |
| `npm run db:push` | Синхронизировать схему через Drizzle |
| `npm run db:studio` | Запустить Drizzle Studio |
| `npm run docker:up` | Запустить PostgreSQL |
| `npm run docker:down` | Остановить PostgreSQL |
| `npm run clean` | Удалить сгенерированные API-клиенты и сборки |

### Server

Из `packages/server` доступны:

| Команда | Назначение |
|---------|------------|
| `npm run debug` | `tsx watch` + Node Inspector |
| `npm run release` | Сборка и запуск release |
| `npm run build:release` | TypeScript build + `tsc-alias` |
| `npm run run:release` | Запуск `dist/index.js` |
| `npm run typecheck` | Проверка типов |
| `npm run db:generate` | Генерация миграций |
| `npm run db:migrate` | Применение миграций |
| `npm run db:push` | Push схемы |
| `npm run db:studio` | Drizzle Studio |
| `npm run docker:up` | Запуск PostgreSQL |
| `npm run docker:down` | Остановка PostgreSQL |

### Client

Из `packages/client` доступны:

| Команда | Назначение |
|---------|------------|
| `npm run debug` | Vite dev-сервер на порту 3000 |
| `npm run build:release` | Type-check + production build |
| `npm run run:release` | Preview production build |
| `npm run preview` | Vite preview на порту 4173 |
| `npm run typecheck` | Проверка типов |
| `npm run typecheck-file` | Проверка одного набора файлов с выводом в `error.log` |
| `npm run format` | Запуск Prettier с переданными аргументами |

## Архитектура

### Server

Сервер состоит из Express-обёртки и Hono API:

- **Express** — HTTP listener, JSON middleware и раздача статических файлов.
- **Hono + OpenAPI** — API на `/api` и Swagger UI.
- **Drizzle ORM** — доступ к PostgreSQL через `IRepository`/репозиторий.
- **DW** — клиент синхронизации с DeepSeek Web API.
- **EmbedderLmStudio** — получение embedding-моделей и эмбеддингов напрямую из LM Studio.

Основные потоки:

```text
DeepSeek Web API
      │
      ▼
packages/server/src/dw.ts
      │
      ▼
Program → IRepository → PostgreSQL
      │
      └── файлы / сообщения / фрагменты

LM Studio
      │
      ▼
EmbedderLmStudio
      │
      ▼
IRepository → embeddings

HTTP client
      │
      ▼
Hono /api
      │
      ▼
PostgreSQL
```

Основные endpoints:

| Endpoint | Назначение |
|----------|------------|
| `POST /api/actions/update` | Синхронизация данных с DeepSeek |
| `POST /api/actions/update-embedding` | Обновление эмбеддингов через LM Studio |
| `GET /api/documents` | Получение документов/сессий |
| `GET /api/embeddings/session/{id}` | Получение эмбеддингов сессии |
| `GET /api/embeddings/query` | Получение эмбеддингов для синхронизации |
| `POST /api/embeddings/` | Приём embedding-данных |

### Client

Клиент разделён на UI и графическую сцену:

- **React UI** — панели и информационные компоненты.
- **AppMediator** — события, команды и небольшой UI state.
- **DataManager** — API + IndexedDB.
- **PointsTransformer** — граница между таблицами данных и Model.
- **PointGraphManager** — владелец текущих точек и графа.
- **NeighborGraph** — коллекция рёбер и индекс смежности.
- **ModelManager** — построение и улучшение графа ближайших соседей.
- **PointsScene / EdgesScene** — D3/SVG View Graph.
- **RepulsionEngine / GraphEngine / ZDampingEngine** — физическая раскладка.
- **AnimationEngine** — единый владелец `requestAnimationFrame`.

Подробная модель связей Model/View зафиксирована в [packages/client/README.md](packages/client/README.md).

### База данных

PostgreSQL 15 запускается в Docker:

| Параметр | Значение |
|----------|----------|
| Host | `localhost` |
| Host port | `6000` |
| Container port | `5432` |
| Database | `mydb` |
| User | `postgres` |
| Password | `postgres` |
| Data directory | `./data/postgres` |

`DbManager` генерирует `.env` и `postgres_db/docker-compose.yaml` при необходимости.

## Порты

| Порт | Назначение |
|------|------------|
| `3000` | Vite development server |
| `4173` | Vite preview |
| `6000` | PostgreSQL host port |
| `8081` | Server API |
| `1234` | LM Studio |
| `9229` | Node.js Inspector |

Порт сервера можно изменить через переменную окружения `PORT`.

## Генерация API-клиентов

В репозитории находятся генераторы:

- `generators/dew` — клиент серверного API.
- `generators/embedder` — клиент старого внешнего embedding API.

Генерируемый код находится в:

- `packages/client/src/clients/dew`;
- `packages/server/src/clients/embedder`.

**Не редактируйте generated-код вручную.** При изменении OpenAPI-контракта обновляйте генераторы и затем запускайте соответствующую генерацию.

> Runtime-реализация эмбеддингов в текущей ветке `dev` — `packages/server/src/EmbedderLmStudio.ts`. Сгенерированный `packages/server/src/clients/embedder` относится к отдельному старому embedding API и сейчас не является runtime-зависимостью `Program`.

## Известные ограничения текущей ветки

README фиксирует только ограничения, которые важны для понимания текущего запуска и разработки. Остальные найденные проблемы и технический долг ведутся отдельно в аудитах.

- **API не имеет полноценной аутентификации/авторизации.** Сервер рассчитан на локальное использование; не следует публиковать его напрямую в интернет.
- **Креденшелы DeepSeek хранятся в БД.** Не добавляйте их в логи или ответы API.
- **Тестовое покрытие отсутствует.** В репозитории нет полноценного набора unit/integration тестов.
- **Shared пока не является npm-пакетом.** Для разработки требуется выполнить `npm run link:shared`.
- **Есть Windows/Unix различия в служебных скриптах.** В частности, `scripts/link-shared.sh` требует Bash, а часть legacy-скриптов и команд db-manager ещё предполагает конкретную shell-среду.
- **Синхронизация эмбеддингов выполняется последовательно по сессиям и моделям.** Это соответствует текущей реализации `EmbedderLmStudio`, а не старому task/polling pipeline.
- **Папка `generators/embedder` сохраняет legacy-клиент внешнего embedding API.** Она не должна восприниматься как описание текущего runtime-конвейера эмбеддингов.

## Документация

- [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — техническая карта проекта и точки входа для AI-агентов.
- [packages/client/README.md](packages/client/README.md) — текущая архитектура клиента.
- [packages/client/CURRENT_POSITION.md](packages/client/CURRENT_POSITION.md) — согласованная архитектурная позиция клиента.
- [docs/INDEPENDENT_AUDIT_2026-09-18.md](docs/INDEPENDENT_AUDIT_2026-09-18.md) — независимый аудит проекта.

## Лицензия

ISC

## Статус

Проект находится в активной разработке. README описывает состояние ветки `dev`; изменения архитектуры и поведения должны сопровождаться соответствующим обновлением технической документации.
