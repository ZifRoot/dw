import "./styles/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
import { SvgEngine } from "./core/Engines/SvgEngine";
import { EdgesScene } from "./core/Scene/EdgesScene";
import { createControlPanel, createInfoPanel, createPipelinePanel } from "./ui";
import { RepulsionAlgorithm, RepulsionEngineConfig } from "./core/physics/RepulsionAlgorithm";
import { AnimationEngine } from "./core/Engines/AnimationEngine";
import { EnginePipeline } from "./core/Engines/EnginePipeline";
import { GraphAlgorithm, GraphEngineConfig } from "./core/physics/GraphAlgorithm";
import { ZDampingConfig, ZDapperAlgorithm } from "./core/physics/ZDapperAlgorithm";
import { DataManager } from "./core/data/DataManager";
import { ModelManager } from "./core/ModelManager";
import { PointsTransformer } from "./core/data/PointsTransformer";
import { DocumentPointsScene } from "./core/DocumentPointsScene";
import { PointsSceneTester } from "./core/PointsSceneTester";
import { MediatorScene } from "./core/Scene/MediatorScene";

type Way = "dw" | "tester" | "levenshtein" | "mediator" | "";

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

function Levenshtein(mediator: AppMediator, animationEngine: AnimationEngine) {
  const documentPointsScene = new DocumentPointsScene(mediator, animationEngine);
  const pointGraphManager = documentPointsScene.getPointGraphManager();
  setTimeout(() => {
    void documentPointsScene.start();
  }, 1);

  return pointGraphManager;
}

function PointGraphManager(b: Way, mediator: AppMediator, animationEngine: AnimationEngine) {
  let X = {
    dw: (mediator: AppMediator, animationEngine: AnimationEngine) => DW(mediator, animationEngine),
    tester: (mediator: AppMediator, animationEngine: AnimationEngine) => Tester(mediator),
    levenshtein: (mediator: AppMediator, animationEngine: AnimationEngine) => Levenshtein(mediator, animationEngine),
    mediator: () => null,
    "": () => null,
  };

  return X[b](mediator, animationEngine);
}
function start(way: Way) {
  const app = creatediv("app", document.body);
  const controlPanelDiv = creatediv("control-panel", app);
  const mainArea = creatediv("main-area", app);
  const canvasDiv = creatediv("canvas-container", mainArea);
  const infoPanelDiv = creatediv("info-panel", mainArea);
  const pipelinePanelDiv = creatediv("pipeline-panel", mainArea);

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

  const pointGraphManager = PointGraphManager(way, mediator, animationEngine);

  if (way === "mediator") {
    const mediatorScene = new MediatorScene(mediator, svgEngine);
  }

  if (pointGraphManager) {
    const pointsScene = new PointsScene(mediator, svgEngine, pointGraphManager);
    const edgesScene = new EdgesScene(mediator, svgEngine, pointGraphManager);

    const zdampingAlgorithm = new ZDapperAlgorithm(mediator, pointGraphManager, new ZDampingConfig());
    const graphAlgorithm = new GraphAlgorithm(mediator, pointGraphManager, new GraphEngineConfig());
    const repulsionAlgorithm = new RepulsionAlgorithm(mediator, pointGraphManager, new RepulsionEngineConfig());

    const enginePipeline = new EnginePipeline(mediator, animationEngine, "Основной pipeline");

    enginePipeline.setConfiguration([
    { name: "Отталкивание", algorithm: repulsionAlgorithm },
    { name: "Связи", algorithm: graphAlgorithm },
    { name: "Затухание по Z", algorithm: zdampingAlgorithm },
  ]);
  }

  createControlPanel(controlPanelDiv, mediator);
  createInfoPanel(infoPanelDiv, mediator);
  createPipelinePanel(pipelinePanelDiv, mediator, [enginePipeline]);
}

function bootstrap() {
  start("dw");
}

bootstrap();
