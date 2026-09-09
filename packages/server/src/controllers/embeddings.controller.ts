import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { BaseController, ParamsIdSchema } from "./base.controller";
import type { EmbeddingCreate } from "@models/EmbeddingCreate";
import { IProgram } from "../iprogram";
import "@utils/array-extensions";
import { toDate } from "@utils/date-utils";

export const EmbeddingDtoSchema = z.object({
  model_name: z.string(),
  embedding: z.array(z.number()),
  dimension: z.number().int().positive(),
  processing_time_ms: z.number().nonnegative(),
  sessionId: z.string().uuid(),
  createdAt: z.date(),
});
export type EmbeddingDto = z.infer<typeof EmbeddingDtoSchema>;

const EmbeddingsArrayDtoSchema = z.array(EmbeddingDtoSchema);
const SuccessResponseSchema = z.object({
  status: z.string(),
  received: z.number(),
});

export const embQuerySchema = z.object({
  updateat: z.coerce
    .date()
    .optional()
    .openapi({ param: { name: "updateat", in: "query" }, example: new Date().toISOString() }),
  modelname: z
    .string()
    .optional()
    .openapi({ param: { name: "modelname", in: "query" }, example: "model name" }),
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
      createdAt: null,
      sessionId: dto.sessionId,
    };
  }

  private registerRoutes() {
    this.router.openapi(
      createRoute({
        method: "get",
        path: "/embeddings/session/{id}", // ← было :id, стало {id}
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
      },
    );

    this.router.openapi(
      createRoute({
        method: "get",
        path: "/embeddings/query",
        tags: ["Embeddings"],
        request: { query: embQuerySchema },
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
          const { updateat, modelname } = c.req.valid("query");
          let updateat_up = updateat ?? new Date();
          const embeddings = await this.repo.findEmbeddingsByDate(toDate(updateat_up as any) ?? undefined, modelname);
          return c.json(embeddings, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      },
    );

    this.router.openapi(
      createRoute({
        method: "post",
        path: "/embeddings/",
        tags: ["Embeddings"],
        request: {
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
          const embeddingsDto = c.req.valid("json");
          const embeddingsCreate = embeddingsDto.map((dto) => this.dtoToEmbeddingCreate(dto));
          const count = [...embeddingsCreate.groupBy((a) => a.sessionId).entries()].reduce(async (r, c) => {
            return (await r) + (await this.repo.createManyEmbeddings(c[0], c[1]));
          }, Promise.resolve(0));

          return c.json({ status: "ok", received: count }, 200);
        } catch (err) {
          console.error(err);
          return c.json({ error: "Internal server error" }, 500);
        }
      },
    );
  }
}
