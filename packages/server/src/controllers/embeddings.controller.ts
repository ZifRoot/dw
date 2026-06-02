import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { BaseController, ParamsIdSchema } from "./base.controller";
import type { EmbeddingCreate } from "@models/EmbeddingCreate";
import { IProgram } from "src/iprogram";

export const EmbeddingDtoSchema = z.object({
  model_name: z.string(),
  embedding: z.array(z.number()),
  dimension: z.number().int().positive(),
  processing_time_ms: z.number().nonnegative(),
  sessionId: z.string().uuid(),
});
export type EmbeddingDto = z.infer<typeof EmbeddingDtoSchema>;

const EmbeddingsArrayDtoSchema = z.array(EmbeddingDtoSchema);
const SuccessResponseSchema = z.object({
  status: z.string(),
  received: z.number(),
});

export class EmbeddingsController extends BaseController {
  public router = new OpenAPIHono();

  constructor(program: IProgram) {
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
    this.router.openapi(
      createRoute({
        method: "post",
        path: "/embedding/:id",
        tags: ["Embeddings"],
        request: {
          params: ParamsIdSchema,
          body: {
            content: {
              "application/json": { schema: EmbeddingsArrayDtoSchema },
            },
          },
        },
        responses: {
          200: {
            description: "Сохранено",
            content: { "application/json": { schema: SuccessResponseSchema } },
          },
          400: { description: "Неверный запрос" },
          404: { description: "Сессия не найдена" },
          500: { description: "Ошибка" },
        },
      }),
      async (c) => {
        try {
          const { id } = c.req.valid("param");
          const session = await this.repo.findSessionById(id);
          if (!session) return c.json({ error: "Document not found" }, 404);
          const embeddingsDto = c.req.valid("json");
          const embeddingsCreate = embeddingsDto.map((dto) =>
            this.dtoToEmbeddingCreate(dto)
          );
          const count = await this.repo.createManyEmbeddings(
            id,
            embeddingsCreate
          );
          return c.json({ status: "ok", received: count }, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      }
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/embedding/:id",
        tags: ["Embeddings"],
        request: { params: ParamsIdSchema },
        responses: {
          200: {
            description: "Список эмбеддингов",
            content: {
              "application/json": { schema: EmbeddingsArrayDtoSchema },
            },
          },
          500: { description: "Ошибка" },
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
