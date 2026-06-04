import { OpenAPIHono } from "@hono/zod-openapi";
import { DocumentsController } from "./documents.controller";
import { EmbeddingsController } from "./embeddings.controller";
import { SystemController } from "./system.controller";
import { swaggerUI } from "@hono/swagger-ui";
import type { Express } from "express";
import { getRequestListener } from "@hono/node-server";
import type { IProgram } from "src/iprogram";

export function setupControllers(app: OpenAPIHono, program: IProgram) {
  const docsCtrl = new DocumentsController(program);
  const embedsCtrl = new EmbeddingsController(program);
  const systemCtrl = new SystemController(program);
  app.route("/", docsCtrl.router);
  app.route("/", embedsCtrl.router);
  app.route("/", systemCtrl.router);
}

/**
 * Создаёт и настраивает Hono-приложение со всей маршрутизацией и документацией.
 * @param program - инстанс Program (бизнес-логика, репозиторий и т.д.)
 */
function createHonoApp(program: IProgram): OpenAPIHono {
  const app = new OpenAPIHono();

  setupControllers(app, program);

  // 2. OpenAPI / Swagger документация
  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "API Documentation",
      version: "1.0.0",
      description: "Автоматическая документация из Zod схем",
    },
    servers: [{ url: "/api" }],
  });

  // Swagger UI (традиционный)
  app.get("/", swaggerUI({ url: "/api/openapi.json" }));

  // // Scalar UI (альтернативная красивая документация)
  // app.get(
  //   "/reference",
  //   apiReference({
  //     spec: { url: "/openapi.json" },
  //     theme: "purple",
  //   }),
  // );

  return app;
}

/**
 * Создаёт Express-приложение с встроенным Hono (маршруты /api/* + документация).
 * @param program - инстанс Program
 * @returns Готовое Express-приложение
 */
export function createExpressApp(program: IProgram, expressApp: Express): Express {
  const honoApp = createHonoApp(program);

  // Монтируем Hono как middleware на корневой путь (или можно на /api)
  // Используем getRequestListener, чтобы превратить Hono.fetch в обработчик Express
  expressApp.use("/api", getRequestListener(honoApp.fetch));

  // При желании можно добавить другие Express-мидлвары, например, статику
  // expressApp.use(express.static("public"));

  return expressApp;
}
