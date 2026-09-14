"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsController = exports.updateatSchema = void 0;
const zod_openapi_1 = require("@hono/zod-openapi");
const zod_1 = require("zod");
const base_controller_1 = require("./base.controller");
require("../shared/utils/array-extensions");
const data_utils_1 = require("../shared/utils/data-utils");
const ChatSessionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    title_type: zod_1.z.string(),
    pinned: zod_1.z.boolean(),
    updated_at: zod_1.z.string(),
    user_id: zod_1.z.string().nullable(),
});
exports.updateatSchema = zod_1.z.object({
    updated_at: zod_1.z
        .date()
        .nullable()
        .openapi({
        param: { name: "updateat", in: "query" },
        example: "session-123",
    }),
});
const ChatSessionsArraySchema = zod_1.z.array(ChatSessionSchema);
class DocumentsController extends base_controller_1.BaseController {
    constructor(program) {
        super(program);
        this.router = new zod_openapi_1.OpenAPIHono();
        this.registerRoutes();
    }
    registerRoutes() {
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/documents",
            tags: ["Documents"],
            responses: {
                200: { description: "Список сессий", content: { "application/json": { schema: ChatSessionsArraySchema } } },
                500: { description: "Ошибка", content: { "application/json": { schema: base_controller_1.ErrorResponseSchema } } },
            },
        }), async (c) => {
            try {
                const sessions = await this.repo.findAllSessionsAll();
                return c.json(sessions, 200);
            }
            catch (err) {
                console.error(err);
                return c.json({ error: "Internal server error" }, 500);
            }
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/document/{id}",
            tags: ["Documents"],
            request: { params: base_controller_1.ParamsIdSchema },
            responses: {
                200: { description: "Детали сессии", content: { "application/json": { schema: base_controller_1.SessionInfoSchema } } },
                404: { description: "Не найдено" },
                500: { description: "Ошибка" },
            },
        }), async (c) => {
            try {
                const { id } = c.req.valid("param");
                const doc = await this.getSessionWithDetails(id);
                if (!doc)
                    return c.json({ error: "Document not found" }, 404);
                return c.json(doc, 200);
            }
            catch (err) {
                console.error(err);
                return c.json({ error: "Internal server error" }, 500);
            }
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/document/{id}/text",
            tags: ["Documents"],
            request: { params: base_controller_1.ParamsIdSchema },
            responses: { 200: { description: "Полный текст", content: { "text/plain": { schema: zod_1.z.string() } } }, 404: { description: "Не найдено" } },
        }), async (c) => {
            const { id } = c.req.valid("param");
            const session = await this.repo.findSessionById(id);
            if (!session)
                return c.text("Document not found", 404);
            const fullText = await this.buildFullText(id);
            return c.text(fullText, 200);
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/document/{id}/parse",
            tags: ["Documents"],
            request: { params: base_controller_1.ParamsIdSchema },
            responses: {
                200: { description: "Результат парсинга", content: { "application/json": { schema: zod_1.z.unknown() } } },
                404: { description: "Не найдено" },
            },
        }), async (c) => {
            const { id } = c.req.valid("param");
            const session = await this.repo.findSessionById(id);
            if (!session)
                return c.text("Not found", 404);
            const fullText = await this.buildFullText(id);
            const parsed = {};
            return c.json(parsed, 200);
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/document/{id}/md",
            tags: ["Documents"],
            request: { params: base_controller_1.ParamsIdSchema },
            responses: {
                200: { description: "Результат парсинга", content: { "application/json": { schema: zod_1.z.unknown() } } },
                404: { description: "Не найдено" },
            },
        }), async (c) => {
            const { id } = c.req.valid("param");
            const session = await this.repo.findSessionById(id);
            if (!session)
                return c.text("Not found", 404);
            const msgs = await this.fragmentsList(id);
            const parsed = msgs.flatMap((m) => m.fragments).flatMap((f) => (0, data_utils_1.md)(f.content));
            return c.json(parsed, 200);
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "get",
            path: "/document/{id}/fragment/{fragment_id}/text",
            tags: ["Documents"],
            request: { params: base_controller_1.ParamsFragmentSchema },
            responses: {
                200: { description: "Текст фрагмента", content: { "text/plain": { schema: zod_1.z.string() } } },
                400: { description: "Неверный формат" },
                404: { description: "Не найден" },
            },
        }), async (c) => {
            const { id, fragment_id } = c.req.valid("param");
            if (fragment_id.startsWith("msg_")) {
                const match = fragment_id.match(/^msg_(\d+)_frag_(\d+)$/);
                if (!match)
                    return c.text("Invalid fragment ID format", 400);
                const messageId = parseInt(match[1], 10);
                const fragmentOrder = parseInt(match[2], 10);
                const fragment = await this.repo.findFragmentById(id, messageId, fragmentOrder);
                if (!fragment)
                    return c.text("Fragment not found", 404);
                return c.text(fragment.content, 200);
            }
            else if (fragment_id.startsWith("file_")) {
                return c.text("File content not available as text", 404);
            }
            else {
                return c.text("Invalid fragment ID", 400);
            }
        });
    }
    async buildFullText(sessionId) {
        const messages = await this.repo.findAllMessages(sessionId);
        const texts = [];
        for (const msg of messages) {
            const fragments = await this.repo.findAllFragments(sessionId, msg.messageId);
            for (const frag of fragments)
                texts.push(frag.content);
        }
        return texts.join("\n\n");
    }
    async getSessionWithDetails(sessionId) {
        const session = await this.repo.findSessionById(sessionId);
        if (!session)
            return null;
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
    async buildFragmentsList(sessionId, messages) {
        const fragmentsList = [];
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
    async fragmentsList(sessionId) {
        const msgs = await this.repo.findAllMessages(sessionId);
        return msgs.mapAsync(async (m) => {
            m.fragments = await this.repo.findAllFragments(sessionId, m.messageId);
            return m;
        }, 1);
    }
}
exports.DocumentsController = DocumentsController;
