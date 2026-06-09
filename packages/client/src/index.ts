import { createRoot } from "react-dom/client";
import { ControlPanel } from "./ui/ControlPanel";
import React from "react";

// Импортируем глобальные стили для холста (Sass скомпилируется в CSS и вставится в HTML)
import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { PointsSceneTester } from "./core/PointsSceneTester";
import { SvgEngine } from "./core/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";

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
let svgEngine = new SvgEngine(canvasDiv);
// Инициализируем движок (он сам создаст SVG внутри canvasDiv)

const scene1 = new EdgesScene(svgEngine);
const scene2 = new PointsScene(svgEngine);

scene1.attachToPointsScene(scene2);
scene2.init();

const tester = new PointsSceneTester(scene2, scene1, {
  updateFrationRange: [20 / 100, 70 / 100],
  removeFrationRange: [5 / 100, 20 / 100],
  targetSize: 5,
  intervalMs: 1000,
  verbose: true,
  fullGraph: true,
});

tester.start();
// Монтируем React UI
const root = createRoot(uiDiv);
root.render(React.createElement(ControlPanel, { mediator }));
