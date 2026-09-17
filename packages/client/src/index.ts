import "./styles/canvas/main.scss";
import { AppMediator } from "./core/AppMediator";
import { PointsScene } from "./core/Scene/PointsScene";
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

function creatediv(id: string, parent: Node) {
  let div = document.getElementById(id);
  if (div) return div;
  div = document.createElement("div");
  div.id = id;
  parent.appendChild(div);
  return div;
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
  mediator.selectedEdge = null;
  setTimeout(() => (mediator.autoZoom = false), 0);

  const svgEngine = new SvgEngine(canvasDiv);
  const animationEngine = new AnimationEngine();

  const modelManager = new ModelManager(mediator, animationEngine, 16);
  const pointGraphManager = modelManager.getPointGraphManager();

  const pointsScene = new PointsScene(svgEngine, mediator, pointGraphManager);
  const edgesScene = new EdgesScene(svgEngine, mediator, pointGraphManager);

  const dataManager = new DataManager(mediator);
  const pointsTransformer = new PointsTransformer(mediator, dataManager, pointGraphManager);

  const zdampingEngine = new ZDampingEngine(mediator, animationEngine, new ZDampingConfig());
  const graphEngine = new GraphEngine(mediator, animationEngine, new GraphEngineConfig());
  const repulsionEngine = new RepulsionEngine(mediator, animationEngine, new RepulsionEngineConfig());

  animationEngine.AfterStep = () => mediator.pointsUpdating();

  graphEngine.setEdges(pointGraphManager.getEdgesArray());
  zdampingEngine.setPoints(pointGraphManager.getPointsArray());
  repulsionEngine.setPoints(pointGraphManager.getPointsArray());

  createControlPanel(controlPanelDiv, mediator);
  createInfoPanel(infoPanelDiv, mediator);

  dataManager.reloadTables();
}

bootstrap();
