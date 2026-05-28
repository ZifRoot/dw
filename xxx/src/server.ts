import express from "express";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { expressAdapter } from "@hono/express";
import { Program } from "./program";
import { setupControllers } from "./controllers";

const hono = new OpenAPIHono();
const program = new Program(); // инициализация по вашему усмотрению
setupControllers(hono, program);

hono.doc("/docs", { openapi: "3.0.0", info: { title: "API", version: "1.0.0" } });
hono.get("/ui", swaggerUI({ url: "/docs" }));

const app = express();
app.use("/api", expressAdapter(hono));
app.listen(3000, () => console.log("Server started"));
