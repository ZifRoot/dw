import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { PointsSceneTester } from "./core/PointsSceneTester";
import { SvgEngine } from "./core/Engines/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";
import { createControlPanel, createInfoPanel } from "./ui";
import { RepulsionEngine, RepulsionEngineConfig } from "./core/physics/RepulsionEngine";
import { AnimationEngine } from "./core/Engines/AnimationEngine";
import { GraphEngine, GraphEngineConfig } from "./core/physics/GraphEngine";

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
mediator.targetSize = 500;
mediator.progress = 0;
mediator.sizeText = 16;
mediator.selectedPoint = null;
mediator.selectedEdge = null;
setTimeout(() => (mediator.autoZoom = false), 0);
let svgEngine = new SvgEngine(canvasDiv);
// Инициализируем движок (он сам создаст SVG внутри canvasDiv)

const edgesScene = new EdgesScene(svgEngine, mediator);
const pointsScene = new PointsScene(svgEngine, mediator);

edgesScene.attachToPointsScene(pointsScene);
pointsScene.init();

const animation1 = new AnimationEngine();
const animation2 = new AnimationEngine();
const repulsionEngine = new RepulsionEngine(mediator, animation1, new RepulsionEngineConfig());
const graphEngine = new GraphEngine(mediator, animation2, new GraphEngineConfig());

graphEngine.setEdges(edgesScene.getEdges());

repulsionEngine.setPoints(pointsScene.getPoints());

const tester = new PointsSceneTester(mediator, pointsScene, edgesScene, {
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
