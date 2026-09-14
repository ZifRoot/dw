"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseController = exports.SessionInfoSchema = exports.ParamsFragmentSchema = exports.updateatSchema = exports.ParamsIdSchema = exports.ErrorResponseSchema = void 0;
const zod_1 = require("zod");
exports.ErrorResponseSchema = zod_1.z.object({
    error: zod_1.z.string(),
});
exports.ParamsIdSchema = zod_1.z.object({
    id: zod_1.z
        .string()
        .min(1)
        .openapi({ param: { name: "id", in: "path" }, example: "session-123" }),
});
exports.updateatSchema = zod_1.z.object({
    id: zod_1.z
        .date()
        .optional()
        .openapi({ param: { name: "updateat", in: "query" }, example: "session-123" }),
});
exports.ParamsFragmentSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    fragment_id: zod_1.z.string().min(1).openapi({ example: "msg_1_frag_2" }),
});
exports.SessionInfoSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    size_bytes: zod_1.z.number(),
    models: zod_1.z.array(zod_1.z.string()),
    fragments: zod_1.z.array(zod_1.z.any()),
    messages: zod_1.z.array(zod_1.z.any()),
});
class BaseController {
    constructor(program) {
        this.program = program;
    }
    get repo() {
        return this.program.repo();
    }
}
exports.BaseController = BaseController;
