import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
// import { HeadingCodeParser } from "mdforge";
import { BaseController, ErrorResponseSchema, ParamsIdSchema, ParamsFragmentSchema, SessionInfoSchema } from "./base.controller";
import { IProgram } from "src/iprogram";

const ChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_type: z.string(),
  pinned: z.boolean(),
  updated_at: z.string(),
  user_id: z.string().nullable(),
});


export const updateatSchema = z.object({
  updated_at: z
    .date()
    .nullable()
    .openapi({
      param: { name: "updateat", in: "query" },
      example: "session-123",
    }),
});

const ChatSessionsArraySchema = z.array(ChatSessionSchema);

export class DocumentsController extends BaseController {
  public router = new OpenAPIHono();
  // private headingCodeParser = new HeadingCodeParser();

  constructor(program: IProgram) {
    super(program);
    this.registerRoutes();
  }

  private registerRoutes() {
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/documents",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Список сессий", content: { "application/json": { schema: ChatSessionsArraySchema } } },
          500: { description: "Ошибка", content: { "application/json": { schema: ErrorResponseSchema } } },
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
      },
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Детали сессии", content: { "application/json": { schema: SessionInfoSchema } } },
          404: { description: "Не найдено" },
          500: { description: "Ошибка" },
        },
      }),
      async (c) => {
        try {
          const { id } = c.req.valid("param");
          const doc = await this.getSessionWithDetails(id);
          if (!doc) return c.json({ error: "Document not found" }, 404);
          return c.json(doc, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      },
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/text",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: { 200: { description: "Полный текст", content: { "text/plain": { schema: z.string() } } }, 404: { description: "Не найдено" } },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const session = await this.repo.findSessionById(id);
        if (!session) return c.text("Document not found", 404);
        const fullText = await this.buildFullText(id);
        return c.text(fullText, 200);
      },
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/parse",
        tags: ["Documents"],
        request: { params: ParamsIdSchema },
        responses: {
          200: { description: "Результат парсинга", content: { "application/json": { schema: z.unknown() } } },
          404: { description: "Не найдено" },
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const session = await this.repo.findSessionById(id);
        if (!session) return c.text("Not found", 404);
        const fullText = await this.buildFullText(id);
        // const parsed = this.headingCodeParser.parse(fullText);
        const parsed = {};
        return c.json(parsed, 200);
      },
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/document/:id/fragment/:fragment_id/text",
        tags: ["Documents"],
        request: { params: ParamsFragmentSchema },
        responses: {
          200: { description: "Текст фрагмента", content: { "text/plain": { schema: z.string() } } },
          400: { description: "Неверный формат" },
          404: { description: "Не найден" },
        },
      }),
      async (c) => {
        const { id, fragment_id } = c.req.valid("param");
        if (fragment_id.startsWith("msg_")) {
          const match = fragment_id.match(/^msg_(\d+)_frag_(\d+)$/);
          if (!match) return c.text("Invalid fragment ID format", 400);
          const messageId = parseInt(match[1], 10);
          const fragmentOrder = parseInt(match[2], 10);
          const fragment = await this.repo.findFragmentById(id, messageId, fragmentOrder);
          if (!fragment) return c.text("Fragment not found", 404);
          return c.text(fragment.content, 200);
        } else if (fragment_id.startsWith("file_")) {
          return c.text("File content not available as text", 404);
        } else {
          return c.text("Invalid fragment ID", 400);
        }
      },
    );
  }

  private async buildFullText(sessionId: string): Promise<string> {
    const messages = await this.repo.findAllMessages(sessionId);
    const texts: string[] = [];
    for (const msg of messages) {
      const fragments = await this.repo.findAllFragments(sessionId, msg.messageId);
      for (const frag of fragments) texts.push(frag.content);
    }
    return texts.join("\n\n");
  }

  private async getSessionWithDetails(sessionId: string): Promise<unknown> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) return null;
    const messages = await this.repo.findAllMessages(sessionId);
    const fragmentsList = await this.buildFragmentsList(sessionId, messages);
    const embeddings = await this.repo.findEmbeddingsBySession(sessionId);
    return {
      ...session,
      size_bytes: fragmentsList.reduce((sum, f) => sum + f.size_bytes, 0),
      models: embeddings.map((e) => e.model_name),
      fragments: fragmentsList,
      messages,
    };
  }

  private async buildFragmentsList(sessionId: string, messages: any[]): Promise<any[]> {
    const fragmentsList: any[] = [];
    for (const msg of messages) {
      const files = await this.repo.getFilesForMessage(sessionId, msg.messageId);
      for (const file of files)
        fragmentsList.push({ id: `file_${file.id}`, name: file.file_name, messageId: msg.messageId, size_bytes: file.file_size });
      const msgFragments = await this.repo.findAllFragments(sessionId, msg.messageId);
      for (const frag of msgFragments)
        fragmentsList.push({
          id: `msg_${msg.messageId}_frag_${frag.fragmentOrder}`,
          messageId: msg.messageId,
          size_bytes: Buffer.byteLength(frag.content, "utf8"),
        });
    }
    return fragmentsList;
  }
}
