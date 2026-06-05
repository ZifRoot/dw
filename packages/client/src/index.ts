import { CanvasEngine } from "./core/CanvasEngine";
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./ui/ControlPanel";
import React from "react";

// Импортируем глобальные стили для холста (Sass скомпилируется в CSS и вставится в HTML)
import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/PointsScene";
import { PointsSceneTester } from "./core/PointsSceneTester";

// Создаём контейнеры
const app = document.getElementById("app")!;

const canvasDiv = document.createElement("div");
canvasDiv.id = "canvas-container";

const uiDiv = document.createElement("div");
uiDiv.id = "ui-container";

app.appendChild(uiDiv);
app.appendChild(canvasDiv);

const mediator = new AppMediator();
mediator.temperature = 100;

// Инициализируем движок (он сам создаст SVG внутри canvasDiv)
const scene = new PointsScene(canvasDiv);
scene.init();

const tester = new PointsSceneTester(scene, {
  minPoints: 20,
  maxPoints: 30,
  updatePercent: 50,
  addCountRange: [2, 5],
  removeCountRange: [2, 4],
  intervalMs: 1000,
  verbose: true,
});

tester.start();
// Монтируем React UI
const root = createRoot(uiDiv);
root.render(React.createElement(ControlPanel, { mediator }));
