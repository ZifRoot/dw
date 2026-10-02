import "./styles/main.scss";
import { AppMediator } from "@core/AppMediator";
import { SvgEngine } from "@core/Engines/SvgEngine";
import { createControlPanel, createInfoPanel } from "./ui";
import { RepulsionAlgorithm, RepulsionEngineConfig } from "./physics/RepulsionAlgorithm";
import { AnimationEngine } from "@core/Engines/AnimationEngine";
import { EnginePipeline } from "@core/Engines/EnginePipeline";
import { GraphAlgorithm, GraphEngineConfig } from "./physics/GraphAlgorithm";
import { ZDampingConfig, ZDapperAlgorithm } from "./physics/ZDapperAlgorithm";
import { DataManager } from "./data/DataManager";
import { ModelManager } from "./Domain/Embedding/ModelManager";
import { PointsTransformer } from "./data/PointsTransformer";
import { LevenshteinManager } from "./Domain/Levenshtein/LevenshteinManager";
import { PointsSceneTester } from "./main/PointsSceneTester";
import { MediatorScene } from "@core/Scenes/MediatorScene";
import { PointsScene } from "@core/Scenes/PointsScene";
import { EdgesScene } from "@core/Scenes/EdgesScene";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { WebGpuBackend } from "@core/Backends/WebGpuBackend";
import { WasmZDapperAlgorithm } from "./physics/wasm/WasmZDapperAlgorithm";
import { WasmPointsTransformer } from "./physics/wasm/WasmPointsTransformer";
import { WebGpuZDapperAlgorithm } from "./physics/webgpu/WebGpuZDapperAlgorithm";
import { WebGpuPointsTransformer } from "./physics/webgpu/WebGpuPointsTransformer";

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
  setTimeout(() => dataManager.reloadTables(), 1);

  return pointGraphManager;
}

function Tester(mediator: AppMediator) {
  const pointsSceneTester = new PointsSceneTester(mediator);
  const pointGraphManager = pointsSceneTester.getPointGraphManager();
  setTimeout(() => pointsSceneTester.start(), 1);

  return pointGraphManager;
}

function Levenshtein(mediator: AppMediator, animationEngine: AnimationEngine) {
  const documentPointsScene = new LevenshteinManager(mediator, animationEngine);
  const pointGraphManager = documentPointsScene.getPointGraphManager();
  setTimeout(() => void documentPointsScene.start(), 1);

  return pointGraphManager;
}

function PointGraphManager(b: Way, mediator: AppMediator, animationEngine: AnimationEngine) {
  const X = {
    dw: (mediator: AppMediator, animationEngine: AnimationEngine) => DW(mediator, animationEngine),
    tester: (mediator: AppMediator, animationEngine: AnimationEngine) => Tester(mediator),
    levenshtein: (mediator: AppMediator, animationEngine: AnimationEngine) => Levenshtein(mediator, animationEngine),
    mediator: () => null,
    "": () => null,
  };

  return X[b](mediator, animationEngine);
}

async function connectWasmZDampingPipeline(
  pipeline: EnginePipeline,
  mediator: AppMediator,
  pointGraphManager: NonNullable<ReturnType<typeof PointGraphManager>>,
): Promise<void> {
  const backend = await WasmBackend.create();
  const transformer = new WasmPointsTransformer(pointGraphManager, backend);
  const algorithm = new WasmZDapperAlgorithm(
    mediator,
    new ZDampingConfig(),
    backend,
    transformer,
  );

  await algorithm.initialize();

  pipeline.setConfiguration([{ name: "Затухание по Z", algorithm }]);
}

async function connectWebGpuZDampingPipeline(
  pipeline: EnginePipeline,
  mediator: AppMediator,
  pointGraphManager: NonNullable<ReturnType<typeof PointGraphManager>>,
): Promise<void> {
  const backend = await WebGpuBackend.create();
  const transformer = new WebGpuPointsTransformer(pointGraphManager, backend);
  const algorithm = new WebGpuZDapperAlgorithm(
    mediator,
    new ZDampingConfig(),
    backend,
    transformer,
  );

  await algorithm.initialize();

  pipeline.setConfiguration([{ name: "Затухание по Z", algorithm }]);
}

function start(way: Way) {
  const app = creatediv("app", document.body);
  const controlPanelDiv = creatediv("control-panel", app);
  const mainArea = creatediv("main-area", app);
  const canvasDiv = creatediv("canvas-container", mainArea);
  const infoPanelDiv = creatediv("info-panel", mainArea);

  const mediator = new AppMediator();
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
    const physicsPointGraphManager = pointGraphManager;
    const pointsScene = new PointsScene(mediator, svgEngine, physicsPointGraphManager);
    const edgesScene = new EdgesScene(mediator, svgEngine, physicsPointGraphManager);

    const zdampingAlgorithm = new ZDapperAlgorithm(mediator, physicsPointGraphManager, new ZDampingConfig());
    const graphAlgorithm = new GraphAlgorithm(mediator, physicsPointGraphManager, new GraphEngineConfig());
    const repulsionAlgorithm = new RepulsionAlgorithm(mediator, physicsPointGraphManager, new RepulsionEngineConfig());

    const enginePipeline = new EnginePipeline(mediator, animationEngine);

    const configureDefaultPipeline = () => {
      enginePipeline.setConfiguration([
        { name: "Отталкивание", algorithm: repulsionAlgorithm },
        { name: "Связи", algorithm: graphAlgorithm },
        { name: "Затухание по Z", algorithm: zdampingAlgorithm },
      ]);
    };

    const tryConfigureExperimentalBackend = async (): Promise<void> => {
      try {
        await connectWasmZDampingPipeline(
          enginePipeline,
          mediator,
          physicsPointGraphManager,
        );
        return;
      } catch (error: unknown) {
        console.warn("WASM physics backend is unavailable.", error);
      }

      try {
        await connectWebGpuZDampingPipeline(
          enginePipeline,
          mediator,
          physicsPointGraphManager,
        );
        return;
      } catch (error: unknown) {
        console.warn("WebGPU physics backend is unavailable.", error);
      }

      configureDefaultPipeline();
    };

    configureDefaultPipeline();
    createControlPanel(controlPanelDiv, mediator);
    createInfoPanel(infoPanelDiv, mediator);

    // Экспериментальные backend pipelines пока намеренно не подключаются.
    // Чтобы включить fallback WASM → WebGPU → default, вызовите функцию ниже.
    if (false) {
      void tryConfigureExperimentalBackend();
    }
  }
}

function bootstrap() {
  start("tester");
}

bootstrap();
