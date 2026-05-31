Понял, исправляюсь. Никаких лишних комментариев, никаких дополнительных обрамлений. Только заголовок (###) с путём в обратных кавычках, затем блок кода с содержимым файла.

### `src/controllers/base.controller.ts`
```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { Program } from '../program';

export const ErrorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ParamsIdSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' }, example: 'session-123' }),
});
export type ParamsId = z.infer<typeof ParamsIdSchema>;

export const ParamsFragmentSchema = z.object({
  id: z.string().min(1),
  fragment_id: z.string().min(1).openapi({ example: 'msg_1_frag_2' }),
});
export type ParamsFragment = z.infer<typeof ParamsFragmentSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  size_bytes: z.number(),
  models: z.array(z.string()),
  fragments: z.array(z.any()),
  messages: z.array(z.any()),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export abstract class BaseController {
  constructor(protected program: Program) {}
  protected get repo() { return this.program.repository; }
}
```

### `src/controllers/documents.controller.ts`
```typescript
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { HeadingCodeParser } from 'mdforge';
import { BaseController, ErrorResponseSchema, ParamsIdSchema, ParamsFragmentSchema, SessionInfoSchema } from './base.controller';

const ChatSessionSchema = z.object({
  id: z.string(), title: z.string(), title_type: z.string(),
  pinned: z.boolean(), updated_at: z.string(), user_id: z.string().nullable(),
});
const ChatSessionsArraySchema = z.array(ChatSessionSchema);

export class DocumentsController extends BaseController {
  public router = new OpenAPIHono();
  private headingCodeParser = new HeadingCodeParser();

  constructor(program: Program) {
    super(program);
    this.registerRoutes();
  }

  private registerRoutes() {
    this.router.openapi(createRoute({
      method: 'get', path: '/documents', tags: ['Documents'],
      responses: { 200: { description: 'Список сессий', content: { 'application/json': { schema: ChatSessionsArraySchema } } }, 500: { description: 'Ошибка', content: { 'application/json': { schema: ErrorResponseSchema } } } }
    }), async (c) => { try { const sessions = await this.repo.findAllSessionsAll(); return c.json(sessions, 200); } catch (err) { console.error(err); return c.json({ error: 'Internal server error' }, 500); } });

    this.router.openapi(createRoute({
      method: 'get', path: '/document/:id', tags: ['Documents'], request: { params: ParamsIdSchema },
      responses: { 200: { description: 'Детали сессии', content: { 'application/json': { schema: SessionInfoSchema } } }, 404: { description: 'Не найдено' }, 500: { description: 'Ошибка' } }
    }), async (c) => { try { const { id } = c.req.valid('param'); const doc = await this.getSessionWithDetails(id); if (!doc) return c.json({ error: 'Document not found' }, 404); return c.json(doc, 200); } catch (err) { console.error(err); return c.json({ error: 'Internal server error' }, 500); } });

    this.router.openapi(createRoute({
      method: 'get', path: '/document/:id/text', tags: ['Documents'], request: { params: ParamsIdSchema },
      responses: { 200: { description: 'Полный текст', content: { 'text/plain': { schema: z.string() } } }, 404: { description: 'Не найдено' } }
    }), async (c) => { const { id } = c.req.valid('param'); const session = await this.repo.findSessionById(id); if (!session) return c.text('Document not found', 404); const fullText = await this.buildFullText(id); return c.text(fullText, 200); });

    this.router.openapi(createRoute({
      method: 'get', path: '/document/:id/parse', tags: ['Documents'], request: { params: ParamsIdSchema },
      responses: { 200: { description: 'Результат парсинга', content: { 'application/json': { schema: z.unknown() } } }, 404: { description: 'Не найдено' } }
    }), async (c) => { const { id } = c.req.valid('param'); const session = await this.repo.findSessionById(id); if (!session) return c.text('Not found', 404); const fullText = await this.buildFullText(id); const parsed = this.headingCodeParser.parse(fullText); return c.json(parsed, 200); });

    this.router.openapi(createRoute({
      method: 'get', path: '/document/:id/fragment/:fragment_id/text', tags: ['Documents'], request: { params: ParamsFragmentSchema },
      responses: { 200: { description: 'Текст фрагмента', content: { 'text/plain': { schema: z.string() } } }, 400: { description: 'Неверный формат' }, 404: { description: 'Не найден' } }
    }), async (c) => { const { id, fragment_id } = c.req.valid('param'); if (fragment_id.startsWith('msg_')) { const match = fragment_id.match(/^msg_(\d+)_frag_(\d+)$/); if (!match) return c.text('Invalid fragment ID format', 400); const messageId = parseInt(match[1], 10); const fragmentOrder = parseInt(match[2], 10); const fragment = await this.repo.findFragmentById(id, messageId, fragmentOrder); if (!fragment) return c.text('Fragment not found', 404); return c.text(fragment.content, 200); } else if (fragment_id.startsWith('file_')) { return c.text('File content not available as text', 404); } else { return c.text('Invalid fragment ID', 400); } });
  }

  private async buildFullText(sessionId: string): Promise<string> {
    const messages = await this.repo.findAllMessages(sessionId);
    const texts: string[] = [];
    for (const msg of messages) {
      const fragments = await this.repo.findAllFragments(sessionId, msg.messageId);
      for (const frag of fragments) texts.push(frag.content);
    }
    return texts.join('\n\n');
  }

  private async getSessionWithDetails(sessionId: string): Promise<unknown> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) return null;
    const messages = await this.repo.findAllMessages(sessionId);
    const fragmentsList = await this.buildFragmentsList(sessionId, messages);
    const embeddings = await this.repo.findEmbeddingsBySession(sessionId);
    return { ...session, size_bytes: fragmentsList.reduce((sum, f) => sum + f.size_bytes, 0), models: embeddings.map((e) => e.model_name), fragments: fragmentsList, messages };
  }

  private async buildFragmentsList(sessionId: string, messages: any[]): Promise<any[]> {
    const fragmentsList: any[] = [];
    for (const msg of messages) {
      const files = await this.repo.getFilesForMessage(sessionId, msg.messageId);
      for (const file of files) fragmentsList.push({ id: `file_${file.id}`, name: file.file_name, messageId: msg.messageId, size_bytes: file.file_size });
      const msgFragments = await this.repo.findAllFragments(sessionId, msg.messageId);
      for (const frag of msgFragments) fragmentsList.push({ id: `msg_${msg.messageId}_frag_${frag.fragmentOrder}`, messageId: msg.messageId, size_bytes: Buffer.byteLength(frag.content, 'utf8') });
    }
    return fragmentsList;
  }
}
```

### `src/controllers/embeddings.controller.ts`
```typescript
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { BaseController, ErrorResponseSchema, ParamsIdSchema } from './base.controller';
import type { EmbeddingCreate } from '../db/models/EmbeddingCreate';

export const EmbeddingDtoSchema = z.object({
  model_name: z.string(),
  embedding: z.array(z.number()),
  dimension: z.number().int().positive(),
  processing_time_ms: z.number().nonnegative(),
  sessionId: z.string().uuid(),
});
export type EmbeddingDto = z.infer<typeof EmbeddingDtoSchema>;

const EmbeddingsArrayDtoSchema = z.array(EmbeddingDtoSchema);
const SuccessResponseSchema = z.object({ status: z.string(), received: z.number() });

export class EmbeddingsController extends BaseController {
  public router = new OpenAPIHono();

  constructor(program: Program) {
    super(program);
    this.registerRoutes();
  }

  private dtoToEmbeddingCreate(dto: EmbeddingDto): EmbeddingCreate {
    return {
      model_name: dto.model_name,
      embedding: dto.embedding,
      dimension: dto.dimension,
      processing_time_ms: dto.processing_time_ms,
      createdAt: Date.now(),
      sessionId: dto.sessionId,
    };
  }

  private registerRoutes() {
    this.router.openapi(createRoute({
      method: 'post', path: '/embeddings/:id', tags: ['Embeddings'],
      request: { params: ParamsIdSchema, body: { content: { 'application/json': { schema: EmbeddingsArrayDtoSchema } } } },
      responses: { 200: { description: 'Сохранено', content: { 'application/json': { schema: SuccessResponseSchema } } }, 400: { description: 'Неверный запрос' }, 404: { description: 'Сессия не найдена' }, 500: { description: 'Ошибка' } }
    }), async (c) => { try { const { id } = c.req.valid('param'); const session = await this.repo.findSessionById(id); if (!session) return c.json({ error: 'Document not found' }, 404); const embeddingsDto = c.req.valid('json'); const embeddingsCreate = embeddingsDto.map(dto => this.dtoToEmbeddingCreate(dto)); const count = await this.repo.createManyEmbeddings(id, embeddingsCreate); return c.json({ status: 'ok', received: count }, 200); } catch (err) { console.error(err); return c.json({ error: 'Internal server error' }, 500); } });

    this.router.openapi(createRoute({
      method: 'get', path: '/embeddings/:id', tags: ['Embeddings'], request: { params: ParamsIdSchema },
      responses: { 200: { description: 'Список эмбеддингов', content: { 'application/json': { schema: z.array(z.unknown()) } } }, 500: { description: 'Ошибка' } }
    }), async (c) => { try { const { id } = c.req.valid('param'); const embeddings = await this.repo.findEmbeddingsBySession(id); return c.json(embeddings, 200); } catch (err) { console.error(err); return c.json({ error: 'Internal server error' }, 500); } });
  }
}
```

### `src/controllers/system.controller.ts`
```typescript
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { BaseController } from './base.controller';
import { safe } from '../utils/data-utils';

export class SystemController extends BaseController {
  public router = new OpenAPIHono();

  constructor(program: Program) {
    super(program);
    this.registerRoutes();
  }

  private registerRoutes() {
    this.router.get('/update', async (c) => { this.program.Update(); return c.json('OK', 200); });
    this.router.get('/update1', async (c) => { await safe(() => this.program.UpdateEmbedding()); return c.json('OK', 200); });
  }
}
```

### `src/controllers/index.ts`
```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { Program } from '../program';
import { DocumentsController } from './documents.controller';
import { EmbeddingsController } from './embeddings.controller';
import { SystemController } from './system.controller';

export function setupControllers(app: OpenAPIHono, program: Program) {
  const docsCtrl = new DocumentsController(program);
  const embedsCtrl = new EmbeddingsController(program);
  const systemCtrl = new SystemController(program);
  app.route('/', docsCtrl.router);
  app.route('/', embedsCtrl.router);
  app.route('/', systemCtrl.router);
}
```

### `src/server.ts` (интеграция с Express)
```typescript
import express from 'express';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { expressAdapter } from '@hono/hono/express';
import { Program } from './program';
import { setupControllers } from './controllers';

const hono = new OpenAPIHono();
const program = new Program(); // инициализация по вашему усмотрению
setupControllers(hono, program);

hono.doc('/docs', { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' } });
hono.get('/ui', swaggerUI({ url: '/docs' }));

const app = express();
app.use('/api', expressAdapter(hono));
app.listen(3000, () => console.log('Server started'));
```

Все файлы готовы. Никаких лишних комментариев, только заголовок и код.