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
import { ZDampingConfig, ZDampingEngine } from "./core/physics/ZDampingEngine";

import { DataManager } from "./core/data/DataManager";
import { ModelManager } from "./core/ModelManager";
import { PointsTransformer } from "./core/PointsTransformer";

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

const pointsScene = new PointsScene(svgEngine, mediator);

const edgesScene = new EdgesScene(svgEngine, mediator, pointsScene);

pointsScene.init();

edgesScene.PointEntities = pointsScene.Entities;

const animationEngine = new AnimationEngine();

const dataManager = new DataManager(mediator);
const pointsTransformer = new PointsTransformer(mediator, dataManager, pointsScene);

const modelManager = new ModelManager(mediator);

const zdampingEngine = new ZDampingEngine(mediator, animationEngine, new ZDampingConfig());
const graphEngine = new GraphEngine(mediator, animationEngine, new GraphEngineConfig());
const repulsionEngine = new RepulsionEngine(mediator, animationEngine, new RepulsionEngineConfig());

animationEngine.AfterStep = () => mediator.pointsUpdating([]);

graphEngine.setEdges(edgesScene.getEdges());
zdampingEngine.setPoints(pointsScene.getPoints());
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

setInterval(() => {
  mediator.modelManagerStep();
}, 1000);
// // Монтируем React UI
// const root = createRoot(uiDiv);
// root.render(React.createElement(ControlPanel, { mediator }));
