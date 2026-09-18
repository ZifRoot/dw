import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { SvgEngine } from "./core/Engines/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";
import { createControlPanel, createInfoPanel } from "./ui";
import { RepulsionAlgorithm, RepulsionEngineConfig } from "./core/physics/RepulsionAlgorithm";
import { AnimationEngine } from "./core/Engines/AnimationEngine";
import { EnginePipeline } from "./core/Engines/EnginePipeline";
import { GraphAlgorithm, GraphEngineConfig } from "./core/physics/GraphAlgorithm";
import { ZDampingConfig, ZDapperAlgorithm } from "./core/physics/ZDapperAlgorithm";
import { DataManager } from "./core/data/DataManager";
import { ModelManager } from "./core/ModelManager";
import { PointsTransformer } from "./core/data/PointsTransformer";
import { PointsSceneTester } from "./core/PointsSceneTester";
import { MediatorScene } from "./core/Scene/MediatorScene";

function creatediv(id: string, parent: Node) {
  let div = document.getElementById(id);
  if (div) return div;
  div = document.createElement("div");
  div.id = id;
  parent.appendChild(div);
  return div;
}

function DW(mediator: AppMediator, animationEngine: AnimationEngine) {
  const modelManager = new ModelManager(mediator, animationEngine, 4);
  const pointGraphManager = modelManager.getPointGraphManager();
  const dataManager = new DataManager(mediator);
  const pointsTransformer = new PointsTransformer(mediator, dataManager, pointGraphManager);
  setTimeout(() => {
    dataManager.reloadTables();
  }, 1);

  return pointGraphManager;
}

function Tester(mediator: AppMediator) {
  const pointsSceneTester = new PointsSceneTester(mediator);
  const pointGraphManager = pointsSceneTester.getPointGraphManager();
  setTimeout(() => {
    pointsSceneTester.start();
  }, 1);

  return pointGraphManager;
}

function PointGraphManager(b: "dw" | "tester", mediator: AppMediator, animationEngine: AnimationEngine) {
  let X = {
    dw: (mediator: AppMediator, animationEngine: AnimationEngine) => DW(mediator, animationEngine),
    tester: (mediator: AppMediator, animationEngine: AnimationEngine) => Tester(mediator),
  };

  return X[b](mediator, animationEngine);
}
function bootstrap() {
  const app = creatediv("app", document.body);
  const controlPanelDiv = creatediv("control-panel", app);
  const mainArea = creatediv("main-area", app);
  const canvasDiv = creatediv("canvas-container", mainArea);
  const infoPanelDiv = creatediv("info-panel", mainArea);

  const mediator = new AppMediator();
  mediator.temperature = 100;
  mediator.targetSize = 500;
  mediator.progress = 0;
  mediator.sizeText = 16;
  mediator.selectedPoint = null;
  mediator.selectedEdge = null;
  setTimeout(() => (mediator.autoZoom = false), 0);

  const svgEngine = new SvgEngine(canvasDiv);
  const animationEngine = new AnimationEngine();
  const pointGraphManager = PointGraphManager("dw", mediator, animationEngine);
  const pointsScene = new PointsScene(mediator, svgEngine, pointGraphManager);
  const edgesScene = new EdgesScene(mediator, svgEngine, pointGraphManager);
  const mediatorScene = new MediatorScene(mediator, svgEngine);

  const zdampingAlgorithm = new ZDapperAlgorithm(mediator, pointGraphManager, new ZDampingConfig());
  const graphAlgorithm = new GraphAlgorithm(mediator, pointGraphManager, new GraphEngineConfig());
  const repulsionAlgorithm = new RepulsionAlgorithm(mediator, pointGraphManager, new RepulsionEngineConfig());

  const enginePipeline = new EnginePipeline(mediator, animationEngine);

  enginePipeline.setConfiguration([{ algorithm: repulsionAlgorithm }, { algorithm: graphAlgorithm }, { algorithm: zdampingAlgorithm }]);

  createControlPanel(controlPanelDiv, mediator);
  createInfoPanel(infoPanelDiv, mediator);
}

bootstrap();
