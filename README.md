# deepseek-w

Система визуализации и навигации по чат-сессиям DeepSeek в виде интерактивного графа. Сервер синхронизирует историю чатов с веб-API DeepSeek, генерирует векторные эмбеддинги через внешний сервис и хранит данные в PostgreSQL. Клиент отображает сессии как точки на 2D/3D канвасе, где близкие по смыслу сессии располагаются рядом благодаря физическому движку на D3.js.

## Особенности

- **Синхронизация с DeepSeek**: Автоматическая загрузка истории чат-сессий, сообщений и файлов
- **Векторные эмбеддинги**: Генерация и агрегация эмбеддингов для семантического поиска и кластеризации
- **Интерактивная визуализация**: Граф сессий с физической симуляцией (отталкивание, притяжение, drag'n'drop)
- **Локальный кэш**: IndexedDB для офлайн-работы и быстрой загрузки
- **API с OpenAPI документацией**: Swagger UI доступен на `/api/`

## Технологический стек

| Компонент | Технологии |
|-----------|------------|
| **Monorepo** | npm workspaces, TypeScript ^6.0.3 |
| **Server** | Express ^5, Hono ^4, Drizzle ORM ^0.45, PostgreSQL 15, Zod ^4 |
| **Client** | React ^18, Vite ^4, D3.js ^7, Axios, Sass |
| **External Services** | DeepSeek Web API, Embedding Service (localhost:8000) |
| **DevTools** | openapi-generator-cli, drizzle-kit, tsc-alias |

## Структура проекта

```
deepseek-w/
├── packages/
│   ├── server/          # Бэкенд: API, синхронизация DeepSeek, эмбеддинги
│   ├── client/          # Фронтенд: визуализация на D3.js
│   └── shared/          # Общие утилиты (логгер, декораторы, векторы)
├── generators/
│   ├── dew/             # Генерация API клиента сервера
│   └── embedder/        # Генерация API клиента embedding-сервиса
├── .vscode/             # Конфигурации отладки
└── link-shared.cmd      # Скрипт создания джанкшенов для shared
```

## Быстрый старт

### Предварительные требования

- Node.js >= 18
- Docker и Docker Compose
- Windows (для работы джанкшенов `link-shared.cmd`) или Linux/Mac (требуется адаптация скрипта)

### Установка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd deepseek-w
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте джанкшены для shared-модуля (**только Windows**):
```bash
./link-shared.cmd
```

Для Linux/Mac используйте `ln -s` вместо `mklink /J`.

4. Запустите сервер (автоматически поднимет PostgreSQL в Docker):
```bash
npm run debug:server
```

Сервер запустится на `http://localhost:8081`, Swagger UI: `http://localhost:8081/api/`

5. В отдельном терминале запустите клиент:
```bash
npm run debug:client
```

Клиент откроется на `http://localhost:3000`

## Основные скрипты

### Корневой package.json

| Команда | Описание |
|---------|----------|
| `npm run link:shared` | Создать джанкшены для shared-модуля |
| `npm run generate:all` | Перегенерировать API клиенты (dew + embedder) |
| `npm run debug:server` | Запуск сервера в режиме отладки (port 8081) |
| `npm run debug:client` | Запуск клиента в режиме разработки (port 3000) |
| `npm run build:release` | Сборка релизных версий клиента и сервера |
| `npm run db:generate` | Генерация миграций Drizzle |
| `npm run db:migrate` | Применение миграций |
| `npm run docker:up` | Поднять PostgreSQL в Docker |
| `npm run docker:down` | Остановить PostgreSQL |
| `npm run clean` | Удалить сгенерированные файлы и сборки |

### Server (packages/server)

| Команда | Описание |
|---------|----------|
| `npm run debug` | Отладка с `tsx watch` и `--inspect` |
| `npm run release` | Сборка и запуск релизной версии |
| `npm run db:studio` | Открыть Drizzle Studio для просмотра БД |

### Client (packages/client)

| Команда | Описание |
|---------|----------|
| `npm run debug` | Vite dev-сервер с hot-reload |
| `npm run build:release` | Production сборка |
| `npm run preview` | Preview production сборки (port 4173) |

## Архитектура

### Сервер

- **Express + Hono**: Express как обёртка, Hono для OpenAPI endpoints на `/api`
- **Drizzle ORM**: Типобезопасная работа с PostgreSQL
- **Embedder**: Оркестрация задач генерации эмбеддингов через внешний сервис `:8000`
- **DeepSeek Client**: Синхронизация с `chat.deepseek.com/api/v0`

Потоки данных:
1. `POST /api/actions/update` — синхронизация сессий и файлов с DeepSeek
2. `POST /api/actions/update-embedding` — генерация эмбеддингов
3. `GET /api/documents` — получение списка сессий
4. `GET /api/embeddings/session/:id` — эмбеддинги сессии

### Клиент

- **AppMediator**: Централизованная шина событий между компонентами
- **SvgEngine**: Рендеринг на SVG с использованием D3.js
- **Physics Engines**: RepulsionEngine, GraphEngine, ZDampingEngine
- **DataManager**: Синхронизация IndexedDB ↔ Server API
- **ModelManager**: Построение графа соседства на основе косинусного расстояния

### База данных

PostgreSQL 15 запускается в Docker на порту 6000:
- Host port: 6000 → Container port: 5432
- Данные хранятся в `./data/postgres` (volume)
- `.env` генерируется автоматически при первом запуске

## Известные проблемы

- **Windows-специфичные скрипты**: `link-shared.cmd`, `docker:up/down` требуют адаптации для Linux/Mac
- **TypeScript version conflict**: Client использует TS ^5.0.0, root — ^6.0.3
- **Embedder spec bug**: `generators/embedder/download.cmd` скачивает spec с неправильного URL
- **Отсутствие тестов**: Проект не имеет unit/integration тестов
- **Нет аутентификации API**: Креденшелы DeepSeek хранятся в БД без шифрования

## Лицензия

ISC

## Статус проекта

Активная разработка. Проект содержит рабочий код, но требует доработки в части:
- Обработки ошибок в Embedder
- Кроссплатформенной совместимости
- Документации API клиентов
- Тестового покрытия
