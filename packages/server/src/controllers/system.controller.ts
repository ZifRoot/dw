import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { BaseController } from "./base.controller";
import { IProgram } from "src/iprogram";

export class SystemController extends BaseController {
  public router = new OpenAPIHono();

  constructor(program: IProgram) {
    super(program);
    this.registerRoutes();
  }

  private registerRoutes() {
    this.router.openapi(
      createRoute({
        method: "post",
        path: "/actions/update",
        tags: ["Actions"],
        responses: {
          200: { description: "Результат парсинга", content: { "application/json": { schema: z.unknown() } } },
          404: { description: "Не найдено" },
        },
      }),
      async (c) => {
        this.program.Update();
        return c.json("OK", 200);
      },
    );

    this.router.openapi(
      createRoute({
        method: "post",
        path: "/actions/update-embedding",
        tags: ["Actions"],
        responses: {
          200: { description: "Результат парсинга", content: { "application/json": { schema: z.unknown() } } },
          404: { description: "Не найдено" },
        },
      }),
      async (c) => {
        this.program.UpdateEmbedding();
        return c.json("OK", 200);
      },
    );
  }
}
