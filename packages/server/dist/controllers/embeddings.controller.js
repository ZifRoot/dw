"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingsController = exports.embQuerySchema = exports.EmbeddingDtoSchema = void 0;
const zod_openapi_1 = require("@hono/zod-openapi");
const zod_1 = require("zod");
const base_controller_1 = require("./base.controller");
require("../shared/utils/array-extensions");
const date_utils_1 = require("../shared/utils/date-utils");
exports.EmbeddingDtoSchema = zod_1.z.object({
    model_name: zod_1.z.string(),
    embedding: zod_1.z.array(zod_1.z.number()),
    dimension: zod_1.z.number().int().positive(),
    processing_time_ms: zod_1.z.number().nonnegative(),
    sessionId: zod_1.z.string().uuid(),
    createdAt: zod_1.z.date(),
});
const EmbeddingsArrayDtoSchema = zod_1.z.array(exports.EmbeddingDtoSchema);
const SuccessResponseSchema = zod_1.z.object({
    status: zod_1.z.string(),
    received: zod_1.z.number(),
});
exports.embQuerySchema = zod_1.z.object({
    updateat: zod_1.z.coerce
        .date()
        .optional()
        .openapi({ param: { name: "updateat", in: "query" }, example: new Date().toISOString() }),
    modelname: zod_1.z
        .string()
        .optional()
        .openapi({ param: { name: "modelname", in: "query" }, example: "model name" }),
});
class EmbeddingsController extends base_controller_1.BaseController {
    constructor(program) {
        super(program);
        this.router = new zod_openapi_1.OpenAPIHono();
        this.registerRoutes();
    }
    dtoToEmbeddingCreate(dto) {
        return {
            model_name: dto.model_name,
            embedding: dto.embedding,
            dimension: dto.dimension,
            processing_time_ms: dto.processing_time_ms,
            createdAt: null,
            sessionId: dto.sessionId,
        };
    }
    registerRoutes() {
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/embeddings/session/{id}",
            tags: ["Embeddings"],
            request: { params: base_controller_1.ParamsIdSchema },
            responses: {
                200: {
                    description: "Список эмбеддингов",
                    content: {
                        "application/json": { schema: EmbeddingsArrayDtoSchema },
                    },
                },
                500: { description: "Ошибка" },
            },
        }), async (c) => {
            try {
                const { id } = c.req.valid("param");
                const embeddings = await this.repo.findEmbeddingsBySession(id);
                return c.json(embeddings, 200);
            }
            catch (err) {
                console.error(err);
                return c.json({ error: "Internal server error" }, 500);
            }
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/embeddings/query",
            tags: ["Embeddings"],
            request: { query: exports.embQuerySchema },
            responses: {
                200: {
                    description: "Список эмбеддингов",
                    content: {
                        "application/json": { schema: EmbeddingsArrayDtoSchema },
                    },
                },
                500: { description: "Ошибка" },
            },
        }), async (c) => {
            try {
                const { updateat, modelname } = c.req.valid("query");
                let updateat_up = updateat ?? new Date();
                const embeddings = await this.repo.findEmbeddingsByDate((0, date_utils_1.toDate)(updateat_up) ?? undefined, modelname);
                return c.json(embeddings, 200);
            }
            catch (err) {
                console.error(err);
                return c.json({ error: "Internal server error" }, 500);
            }
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
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
        }), async (c) => {
            try {
                const embeddingsDto = c.req.valid("json");
                const embeddingsCreate = embeddingsDto.map((dto) => this.dtoToEmbeddingCreate(dto));
                const count = [...embeddingsCreate.groupBy((a) => a.sessionId).entries()].reduce(async (r, c) => {
                    return (await r) + (await this.repo.createManyEmbeddings(c[0], c[1]));
                }, Promise.resolve(0));
                return c.json({ status: "ok", received: count }, 200);
            }
            catch (err) {
                console.error(err);
                return c.json({ error: "Internal server error" }, 500);
            }
        });
    }
}
exports.EmbeddingsController = EmbeddingsController;
