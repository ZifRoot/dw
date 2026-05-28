import { OpenAPIHono } from "@hono/zod-openapi";
import { BaseController } from "./base.controller";
import { IProgram } from "src/iprogram";

export class SystemController extends BaseController {
  public router = new OpenAPIHono();

  constructor(program: IProgram) {
    super(program);
    this.registerRoutes();
  }

  private registerRoutes() {
    this.router.get("/update", async (c) => {
      this.program.Update();
      return c.json("OK", 200);
    });
    this.router.get("/update1", async (c) => {
      await this.program.UpdateEmbedding();
      return c.json("OK", 200);
    });
  }
}
