import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { SvgEngine } from "./core/Engines/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";
import { PointGraphManager } from "./core/PointGraphManager";
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
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "control-panel";
app.appendChild(controlPanelDiv);

const mainArea = document.createElement("div");
mainArea.className = "main-area";
app.appendChild(mainArea);

const canvasDiv = document.createElement("div");
canvasDiv.id = "canvas-container";
mainArea.appendChild(canvasDiv);

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

const svgEngine = new SvgEngine(canvasDiv);
const pointGraphManager = new PointGraphManager(mediator);

const pointsScene = new PointsScene(svgEngine, mediator, pointGraphManager);
const edgesScene = new EdgesScene(svgEngine, mediator, pointGraphManager);
pointsScene.init();

const animationEngine = new AnimationEngine();
const dataManager = new DataManager(mediator);
const pointsTransformer = new PointsTransformer(mediator, dataManager, pointGraphManager);

// ModelManager и сцены используют один PointGraphManager.
// Через mediator передаются только сигналы, а не массивы точек/рёбер.
const modelManager = new ModelManager(mediator, pointGraphManager, 16);

const zdampingEngine = new ZDampingEngine(mediator, animationEngine, new ZDampingConfig());
const graphEngine = new GraphEngine(mediator, animationEngine, new GraphEngineConfig());
const repulsionEngine = new RepulsionEngine(mediator, animationEngine, new RepulsionEngineConfig());

animationEngine.AfterStep = () => mediator.pointsUpdating();

graphEngine.setEdges(pointGraphManager.getEdgesArray());
zdampingEngine.setPoints(pointGraphManager.getPointsArray());
repulsionEngine.setPoints(pointGraphManager.getPointsArray());

await dataManager.reloadTables();

createControlPanel(controlPanelDiv, mediator);
createInfoPanel(infoPanelDiv, mediator);
