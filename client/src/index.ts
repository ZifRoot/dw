import { CanvasEngine } from "./core/CanvasEngine";
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./ui/ControlPanel";
import React from "react";

// Импортируем глобальные стили для холста (Sass скомпилируется в CSS и вставится в HTML)
import "./styles/canvas/main.scss";

// Создаём контейнеры
const app = document.getElementById("app")!;

const canvasDiv = document.createElement("div");
canvasDiv.id = "canvas-container";

const uiDiv = document.createElement("div");
uiDiv.id = "ui-container";

app.appendChild(uiDiv);
app.appendChild(canvasDiv);

// Инициализируем движок (он сам создаст SVG внутри canvasDiv)
const engine = new CanvasEngine(canvasDiv);

// Монтируем React UI
const root = createRoot(uiDiv);
root.render(React.createElement(ControlPanel, { engine }));
