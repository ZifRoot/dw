"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupControllers = setupControllers;
exports.createExpressApp = createExpressApp;
const zod_openapi_1 = require("@hono/zod-openapi");
const documents_controller_1 = require("./documents.controller");
const embeddings_controller_1 = require("./embeddings.controller");
const action_controller_1 = require("./action.controller");
const swagger_ui_1 = require("@hono/swagger-ui");
const node_server_1 = require("@hono/node-server");
function setupControllers(app, program) {
    const docsCtrl = new documents_controller_1.DocumentsController(program);
    const embedsCtrl = new embeddings_controller_1.EmbeddingsController(program);
    const actionCtrl = new action_controller_1.ActionController(program);
    app.route("/", docsCtrl.router);
    app.route("/", embedsCtrl.router);
    app.route("/", actionCtrl.router);
}
function createHonoApp(program) {
    const app = new zod_openapi_1.OpenAPIHono();
    setupControllers(app, program);
    app.doc("/openapi.json", {
        openapi: "3.0.0",
        info: {
            title: "API Documentation",
            version: "1.0.0",
            description: "Автоматическая документация из Zod схем",
        },
        servers: [{ url: "/api" }],
    });
    app.get("/", (0, swagger_ui_1.swaggerUI)({ url: "/api/openapi.json" }));
    return app;
}
function createExpressApp(program, expressApp) {
    const honoApp = createHonoApp(program);
    expressApp.use("/api", (0, node_server_1.getRequestListener)(honoApp.fetch));
    return expressApp;
}
