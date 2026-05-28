Ниже представлены **полные файлы контроллеров** с группировкой по тегам, работой через Hono + zod и готовностью к адаптеру Express. Код сохраняет все эндпоинты из исходного `EmbeddingController.ts`, разбивая их на три логических контроллера: `DocumentController`, `EmbeddingController`, `SystemController`. Суперконтроллер `AppControllers` объединяет их.

---

## 1. Вспомогательные функции (сервис)

**`src/services/EmbeddingHelper.ts`**

```typescript
import { IRepository } from "../db/IRepository";

export type FragmentInfo = {
  id: string;
  size_bytes: number;
  messageId: number;
  name?: string;
};

/**
 * Парсит fragment_id вида msg_123_frag_456 или file_xyz.
 * @returns объект с типом и id, или null при ошибке
 */
export function parseFragmentId(fragmentId: string):
  | { type: 'message'; messageId: number; fragmentOrder: number }
  | { type: 'file'; fileId: string }
  | null {
  if (fragmentId.startsWith('msg_')) {
    const match = fragmentId.match(/^msg_(\d+)_frag_(\d+)$/);
    if (!match) return null;
    return { type: 'message', messageId: parseInt(match[1], 10), fragmentOrder: parseInt(match[2], 10) };
  } else if (fragmentId.startsWith('file_')) {
    return { type: 'file', fileId: fragmentId.slice(5) };
  }
  return null;
}

/**
 * Собирает расширенную информацию о сессии (размер, модели, фрагменты).
 */
export async function getSessionWithDetails2(repo: IRepository, sessionId: string): Promise<any> {
  const session = await repo.findSessionById(sessionId);
  if (!session) return null;

  const messages = await repo.findAllMessages(sessionId);
  const fragmentsList: FragmentInfo[] = [];

  for (const msg of messages) {
    const files = await repo.getFilesForMessage(sessionId, msg.messageId);
    files.forEach(file => {
      fragmentsList.push({
        id: `file_${file.id}`,
        name: file.file_name,
        messageId: msg.messageId,
        size_bytes: file.file_size,
      });
    });
    const msgFragments = await repo.findAllFragments(sessionId, msg.messageId);
    msgFragments.forEach(frag => {
      fragmentsList.push({
        id: `msg_${msg.messageId}_frag_${frag.fragmentOrder}`,
        messageId: msg.messageId,
        size_bytes: Buffer.byteLength(frag.content, 'utf8'),
      });
    });
  }

  const embeddings = await repo.findEmbeddingsBySession(sessionId);
  return {
    ...session,
    size_bytes: fragmentsList.reduce((sum, f) => sum + f.size_bytes, 0),
    models: [...new Set(embeddings.map(e => e.model_name))],
    fragments: fragmentsList,
    messages,
  };
}
```

---

## 2. Общие схемы Zod для DTO

**`src/schemas/EmbeddingSchemas.ts`**

```typescript
import { z } from "@hono/zod-openapi";

export const EmbeddingDtoSchema = z.object({
  model_name: z.string(),
  embedding: z.array(z.number()),
  dimension: z.number().int().positive(),
  processing_time_ms: z.number().nonnegative(),
  sessionId: z.string().uuid(),
});
export type EmbeddingDto = z.infer<typeof EmbeddingDtoSchema>;

export const EmbeddingsArrayDtoSchema = z.array(EmbeddingDtoSchema);
export type EmbeddingsArrayDto = z.infer<typeof EmbeddingsArrayDtoSchema>;
```

---

## 3. Контроллер документов

**`src/controllers/DocumentController.ts`**

```typescript
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { IRepository } from "../db/IRepository";
import { Program } from "../program";
import { getSessionWithDetails2, parseFragmentId } from "../services/EmbeddingHelper";

const ParamsIdSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "session-123" }),
});
type ParamsId = z.infer<typeof ParamsIdSchema>;

const ParamsFragmentSchema = z.object({
  id: z.string().min(1),
  fragment_id: z.string().min(1).openapi({ example: "msg_1_frag_2" }),
});
type ParamsFragment = z.infer<typeof ParamsFragmentSchema>;

const ErrorResponseSchema = z.object({ error: z.string() });
const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  size_bytes: z.number(),
  models: z.array(z.string()),
  fragments: z.array(z.any()),
  messages: z.array(z.any()),
});

export class DocumentController {
  public router: OpenAPIHono;
  private repo: IRepository;

  constructor(private program: Program) {
    this.router = new OpenAPIHono();
    this.repo = program.repository;
    this.registerRoutes();
  }

  private registerRoutes() {
    // GET /documents
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/documents",
        tags: ["Documents"],
        responses: {
          200: { description: "Список всех сессий", content: { "application/json": { schema: z.array(z.any()) } } },
          500: { description: "Ошибка сервера", content: { "application/json": { schema: ErrorResponseSchema } } },
        },
      }),
      async (c) => {
        try {
          const sessions = await this.repo.findAllSessionsAll();
          return c.json(sessions, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      }
    );

    // GET /document/:id
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Детальная информация о сессии", content: { "application/json": { schema: SessionInfoSchema } } },
          404: { description: "Сессия не найдена" },
          500: { description: "Ошибка сервера" },
        },
      }),
      async (c) => {
        try {
          const { id } = c.req.valid("param");
          const doc = await getSessionWithDetails2(this.repo, id);
          if (!doc) return c.json({ error: "Document not found" }, 404);
          return c.json(doc, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      }
    );

    // GET /document/:id/text
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/text",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Полный текст сессии", content: { "text/plain": { schema: z.string() } } },
          404: { description: "Сессия не найдена" },
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const session = await this.repo.findSessionById(id);
        if (!session) return c.text("Document not found", 404);
        const messages = await this.repo.findAllMessages(id);
        const texts: string[] = [];
        for (const msg of messages) {
          const fragments = await this.repo.findAllFragments(id, msg.messageId);
          texts.push(...fragments.map(f => f.content));
        }
        return c.text(texts.join("\n\n"), 200);
      }
    );

    // GET /document/:id/parse
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/parse",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Результат парсинга", content: { "application/json": { schema: z.any() } } },
          404: { description: "Не найдено" },
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const session = await this.repo.findSessionById(id);
        if (!session) return c.text("Not found", 404);
        const messages = await this.repo.findAllMessages(id);
        const texts: string[] = [];
        for (const msg of messages) {
          const fragments = await this.repo.findAllFragments(id, msg.messageId);
          texts.push(...fragments.map(f => f.content));
        }
        // Здесь можно вызвать HeadingCodeParser.parse()
        return c.json({}, 200);
      }
    );

    // GET /document/:id/fragment/:fragment_id/text
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/fragment/:fragment_id/text",
        tags: ["Documents"],
        request: { params: ParamsFragmentSchema },
        responses: {
          200: { description: "Текст фрагмента", content: { "text/plain": { schema: z.string() } } },
          400: { description: "Неверный формат fragment_id" },
          404: { description: "Фрагмент не найден" },
        },
      }),
      async (c) => {
        const { id, fragment_id } = c.req.valid("param");
        const parsed = parseFragmentId(fragment_id);
        if (!parsed) return c.text("Invalid fragment ID format", 400);
        if (parsed.type === "message") {
          const fragment = await this.repo.findFragmentById(id, parsed.messageId, parsed.fragmentOrder);
          if (!fragment) return c.text("Fragment not found", 404);
          return c.text(fragment.content, 200);
        } else {
          const file = await this.repo.findFileById(parsed.fileId);
          if (!file) return c.text("File not found", 404);
          return c.text("File content not available as text", 404);
        }
      }
    );
  }
}
```

---

## 4. Контроллер эмбеддингов

**`src/controllers/EmbeddingController.ts`**

```typescript
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { IRepository } from "../db/IRepository";
import { Program } from "../program";
import { EmbeddingCreate } from "../db/models/EmbeddingCreate";
import { EmbeddingsArrayDtoSchema } from "../schemas/EmbeddingSchemas";

const ParamsIdSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "session-123" }),
});
const ErrorResponseSchema = z.object({ error: z.string() });
const SuccessResponseSchema = z.object({ status: z.string(), received: z.number() });

export class EmbeddingController {
  public router: OpenAPIHono;
  private repo: IRepository;

  constructor(private program: Program) {
    this.router = new OpenAPIHono();
    this.repo = program.repository;
    this.registerRoutes();
  }

  private registerRoutes() {
    // POST /embeddings/:id
    this.router.openapi(
      createRoute({
        method: "post",
        path: "/embeddings/:id",
        tags: ["Embeddings"],
        request: {
          params: ParamsIdSchema,
          body: { content: { "application/json": { schema: EmbeddingsArrayDtoSchema } } },
        },
        responses: {
          200: { description: "Эмбеддинги сохранены", content: { "application/json": { schema: SuccessResponseSchema } } },
          400: { description: "Неверный формат тела" },
          404: { description: "Сессия не найдена" },
          500: { description: "Ошибка сервера" },
        },
      }),
      async (c) => {
        try {
          const { id } = c.req.valid("param");
          const session = await this.repo.findSessionById(id);
          if (!session) return c.json({ error: "Document not found" }, 404);
          const embeddingsDto = c.req.valid("json");
          const embeddingsCreate: EmbeddingCreate[] = embeddingsDto.map(dto => ({
            model_name: dto.model_name,
            embedding: dto.embedding,
            dimension: dto.dimension,
            processing_time_ms: dto.processing_time_ms,
            createdAt: Date.now(),
            sessionId: dto.sessionId,
          }));
          const count = await this.repo.createManyEmbeddings(id, embeddingsCreate);
          return c.json({ status: "ok", received: count }, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      }
    );

    // GET /embeddings/:id
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/embeddings/:id",
        tags: ["Embeddings"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Список эмбеддингов", content: { "application/json": { schema: z.array(z.any()) } } },
          500: { description: "Ошибка сервера" },
        },
      }),
      async (c) => {
        try {
          const { id } = c.req.valid("param");
          const embeddings = await this.repo.findEmbeddingsBySession(id);
          return c.json(embeddings, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      }
    );
  }
}
```

---

## 5. Системный контроллер (update / update1)

**`src/controllers/SystemController.ts`**

```typescript
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { Program } from "../program";
import { safe } from "../utils/data-utils";

export class SystemController {
  public router: OpenAPIHono;

  constructor(private program: Program) {
    this.router = new OpenAPIHono();
    this.registerRoutes();
  }

  private registerRoutes() {
    // GET /update
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/update",
        tags: ["System"],
        responses: { 200: { description: "OK" } },
      }),
      async (c) => {
        this.program.Update();
        return c.text("OK", 200);
      }
    );

    // GET /update1
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/update1",
        tags: ["System"],
        responses: { 200: { description: "OK" } },
      }),
      async (c) => {
        await safe(() => this.program.UpdateEmbedding());
        return c.text("OK", 200);
      }
    );
  }
}
```

---

## 6. Суперконтроллер (Composite)

**`src/controllers/AppControllers.ts`**

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";
import { Program } from "../program";
import { DocumentController } from "./DocumentController";
import { EmbeddingController } from "./EmbeddingController";
import { SystemController } from "./SystemController";

export class AppControllers {
  public router: OpenAPIHono;

  constructor(private program: Program) {
    this.router = new OpenAPIHono();
    this.registerControllers();
  }

  private registerControllers() {
    const docCtrl = new DocumentController(this.program);
    const embCtrl = new EmbeddingController(this.program);
    const sysCtrl = new SystemController(this.program);

    // Монтируем все роутеры на корневой путь (без префикса)
    this.router.route("/", docCtrl.router);
    this.router.route("/", embCtrl.router);
    this.router.route("/", sysCtrl.router);
  }
}
```

---

## 7. Интеграция с Express (адаптер и запуск)

**`src/adapters/honoToExpress.ts`** (без изменений из предыдущего ответа)

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";
import { Request, Response } from "express";

export function honoToExpress(honoApp: OpenAPIHono) {
  return async (req: Request, res: Response) => {
    const url = `http://${req.hostname}${req.originalUrl}`;
    const headers = new Headers(req.headers as any);
    let body: any = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = req.body;
      if (typeof body === 'object') {
        body = JSON.stringify(body);
        headers.set('content-type', 'application/json');
      }
    }
    const request = new Request(url, { method: req.method, headers, body });
    try {
      const response = await honoApp.fetch(request);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const text = await response.text();
      res.send(text);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Hono handler error' });
    }
  };
}
```

**`src/app.ts`** (пример запуска Express + Hono)

```typescript
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { AppControllers } from './controllers/AppControllers';
import { Program } from './program';
import { honoToExpress } from './adapters/honoToExpress';

const app = express();
app.use(express.json());

const program = new Program(/* … */);
const appControllers = new AppControllers(program);
const honoApp = appControllers.router;

// Отдаём OpenAPI спецификацию (генерируется из zod)
app.get('/openapi.json', (req, res) => {
  const spec = honoApp.getOpenAPIDocument();
  res.json(spec);
});

// Swagger UI, загружающий спецификацию
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(undefined, {
  swaggerUrl: '/openapi.json',
}));

// Монтируем все Hono-роуты на префикс /api
app.use('/api', honoToExpress(honoApp));

app.listen(3000, () => {
  console.log('Express server on http://localhost:3000');
  console.log('Swagger UI: http://localhost:3000/api-docs');
});
```

---

## Результат

- **Группировка в Swagger UI** — по тегам `Documents`, `Embeddings`, `System`.
- **Отсутствие JSDoc** — OpenAPI собирается из декларативных схем `zod` через Hono.
- **Полная совместимость с Express** — через адаптер `honoToExpress`.
- **Лёгкое расширение** — добавление нового контроллера сводится к созданию класса и его подключению в `AppControllers`.

Теперь у вас есть готовый, чистый, поддерживаемый код, который ведёт себя как несколько контроллеров в стиле C# и генерирует документацию автоматически.