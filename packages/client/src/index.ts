import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { PointsSceneTester } from "./core/PointsSceneTester";
import { SvgEngine } from "./core/Engines/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";
import { createControlPanel, createInfoPanel } from "./ui";
import { RepulsionEngine } from "./core/physics/RepulsionEngine";

// Создаём контейнеры
const app = document.getElementById("app")!;
// Верхняя панель управления
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "control-panel";
app.appendChild(controlPanelDiv);

// Основная область
const mainArea = document.createElement("div");
mainArea.className = "main-area";
app.appendChild(mainArea);

// Контейнер канваса
const canvasDiv = document.createElement("div");
canvasDiv.id = "canvas-container";
mainArea.appendChild(canvasDiv);

// Контейнер боковой панели
const infoPanelDiv = document.createElement("div");
infoPanelDiv.id = "info-panel";
mainArea.appendChild(infoPanelDiv);

const mediator = new AppMediator();
mediator.temperature = 100;
mediator.targetSize = 5;
mediator.progress = 0;
mediator.sizeText = 16;
let svgEngine = new SvgEngine(canvasDiv);
// Инициализируем движок (он сам создаст SVG внутри canvasDiv)

const scene1 = new EdgesScene(svgEngine, mediator);
const scene2 = new PointsScene(svgEngine, mediator);

scene1.attachToPointsScene(scene2);
scene2.init();

let repulsionEngine = new RepulsionEngine(mediator, 0.1);
repulsionEngine.setPoints(scene2.getPoints());

const tester = new PointsSceneTester(mediator, scene2, scene1, {
  updateFrationRange: [0 / 100, 0 / 100],
  removeFrationRange: [0 / 100, 0 / 100],
  targetSize: 5,
  intervalMs: 3000,
  verbose: true,
  fullGraph: true,
});

tester.start();

createControlPanel(controlPanelDiv, mediator);

createInfoPanel(infoPanelDiv, mediator);
// // Монтируем React UI
// const root = createRoot(uiDiv);
// root.render(React.createElement(ControlPanel, { mediator }));
