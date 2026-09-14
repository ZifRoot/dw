"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionController = void 0;
const zod_openapi_1 = require("@hono/zod-openapi");
const base_controller_1 = require("./base.controller");
class ActionController extends base_controller_1.BaseController {
    constructor(program) {
        super(program);
        this.router = new zod_openapi_1.OpenAPIHono();
        this.registerRoutes();
    }
    registerRoutes() {
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "post",
            path: "/actions/update",
            tags: ["Actions"],
            responses: {
                200: { description: "Результат парсинга", content: { "application/json": { schema: zod_openapi_1.z.unknown() } } },
                404: { description: "Не найдено" },
            },
        }), async (c) => {
            this.program.Update();
            return c.json("OK", 200);
        });
        this.router.openapi((0, zod_openapi_1.createRoute)({
            method: "post",
            path: "/actions/update-embedding",
            tags: ["Actions"],
            responses: {
                200: { description: "Результат парсинга", content: { "application/json": { schema: zod_openapi_1.z.unknown() } } },
                404: { description: "Не найдено" },
            },
        }), async (c) => {
            this.program.UpdateEmbedding();
            return c.json("OK", 200);
        });
    }
}
exports.ActionController = ActionController;
