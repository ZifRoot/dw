import "./styles/main.scss";
import { AppMediator } from "@core/AppMediator";
import { SvgEngine } from "@core/Engines/SvgEngine";
import { createControlPanel, createInfoPanel } from "./ui";
import { RepulsionAlgorithm, RepulsionEngineConfig } from "./physics/RepulsionAlgorithm";
import { AnimationEngine } from "@core/Engines/AnimationEngine";
import { EnginePipeline, EnginePipelineSynchronization } from "@core/Engines/EnginePipeline";
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
import { WasmRepulsionAlgorithm } from "./physics/wasm/WasmRepulsionAlgorithm";
import { WasmGraphAlgorithm } from "./physics/wasm/WasmGraphAlgorithm";
import { WasmEdgesTransformer } from "./physics/wasm/WasmEdgesTransformer";
import { WasmPointsTransformer } from "./physics/wasm/WasmPointsTransformer";
import { WebGpuZDapperAlgorithm } from "./physics/webgpu/WebGpuZDapperAlgorithm";
import { WebGpuRepulsionAlgorithm } from "./physics/webgpu/WebGpuRepulsionAlgorithm";
import { WebGpuGraphAlgorithm } from "./physics/webgpu/WebGpuGraphAlgorithm";
import { WebGpuEdgesTransformer } from "./physics/webgpu/WebGpuEdgesTransformer";
import { WebGpuPointsTransformer } from "./physics/webgpu/WebGpuPointsTransformer";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { LogSafe } from "@utils/logger";

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

function GetPointGraphManager(b: Way, mediator: AppMediator, animationEngine: AnimationEngine) {
  const X = {
    dw: (mediator: AppMediator, animationEngine: AnimationEngine) => DW(mediator, animationEngine),
    tester: (mediator: AppMediator, animationEngine: AnimationEngine) => Tester(mediator),
    levenshtein: (mediator: AppMediator, animationEngine: AnimationEngine) => Levenshtein(mediator, animationEngine),
    mediator: () => null,
    "": () => null,
  };

  return X[b](mediator, animationEngine);
}

interface PhysicsConfigurations {
  repulsion: RepulsionEngineConfig;
  graph: GraphEngineConfig;
  zdamping: ZDampingConfig;
}

class Backends {
  @LogSafe
  async connectWasmPipeline(
    pipeline: EnginePipeline,
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    configurations: PhysicsConfigurations,
  ) {
    const backend = await WasmBackend.create();
    const memory = backend.createMemory();
    const pointsTransformer = new WasmPointsTransformer(pointGraphManager, backend);
    const edgesTransformer = new WasmEdgesTransformer(pointGraphManager, backend);

    const repulsion = new WasmRepulsionAlgorithm(mediator, configurations.repulsion, backend, pointsTransformer);
    const graph = new WasmGraphAlgorithm(mediator, configurations.graph, backend, pointsTransformer, edgesTransformer);
    const zdamping = new WasmZDapperAlgorithm(mediator, configurations.zdamping, backend, pointsTransformer);

    await repulsion.initialize(memory);
    await graph.initialize(memory);
    await zdamping.initialize(memory);

    const synchronization: EnginePipelineSynchronization = {
      load: () => pointsTransformer.load(),
      save: () => pointsTransformer.save(),
    };

    pipeline.setConfiguration(
      [
        { name: "Отталкивание", algorithm: repulsion },
        { name: "Связи", algorithm: graph },
        { name: "Затухание по Z", algorithm: zdamping },
      ],
      synchronization,
    );
    return true;
  }

  @LogSafe
  async connectWebGpuPipeline(
    pipeline: EnginePipeline,
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    configurations: PhysicsConfigurations,
  ) {
    const backend = await WebGpuBackend.create();
    const pointsTransformer = new WebGpuPointsTransformer(pointGraphManager, backend);
    const edgesTransformer = new WebGpuEdgesTransformer(pointGraphManager, backend);

    const repulsion = new WebGpuRepulsionAlgorithm(
      mediator,
      configurations.repulsion,
      backend,
      pointsTransformer,
    );
    const graph = new WebGpuGraphAlgorithm(
      mediator,
      configurations.graph,
      backend,
      pointsTransformer,
      edgesTransformer,
    );
    const zdamping = new WebGpuZDapperAlgorithm(
      mediator,
      configurations.zdamping,
      backend,
      pointsTransformer,
    );

    await repulsion.initialize();
    await graph.initialize();
    await zdamping.initialize();

    const synchronization: EnginePipelineSynchronization = {
      load: () => pointsTransformer.load(),
      save: () => pointsTransformer.save(),
    };

    pipeline.setConfiguration(
      [
        { name: "Отталкивание", algorithm: repulsion },
        { name: "Связи", algorithm: graph },
        { name: "Затухание по Z", algorithm: zdamping },
      ],
      synchronization,
    );
    return true;
  }
}

function configureDefaultPipeline(
  pipeline: EnginePipeline,
  mediator: AppMediator,
  pointGraphManager: PointGraphManager,
  configurations: PhysicsConfigurations,
): void {
  pipeline.setConfiguration([
    {
      name: "Отталкивание",
      algorithm: new RepulsionAlgorithm(mediator, pointGraphManager, configurations.repulsion),
    },
    {
      name: "Связи",
      algorithm: new GraphAlgorithm(mediator, pointGraphManager, configurations.graph),
    },
    {
      name: "Затухание по Z",
      algorithm: new ZDapperAlgorithm(mediator, pointGraphManager, configurations.zdamping),
    },
  ]);
}

async function configurePipeline(
  pipeline: EnginePipeline,
  mediator: AppMediator,
  pointGraphManager: PointGraphManager,
  configurations: PhysicsConfigurations,
): Promise<void> {
  const backends = new Backends();

  try {
    if (await backends.connectWebGpuPipeline(pipeline, mediator, pointGraphManager, configurations)) return;
  } catch (error) {
    console.warn("WebGPU physics backend is unavailable; trying WASM.", error);
  }

  try {
    if (await backends.connectWasmPipeline(pipeline, mediator, pointGraphManager, configurations)) return;
  } catch (error) {
    console.warn("WASM physics backend is unavailable; using JavaScript.", error);
  }

  configureDefaultPipeline(pipeline, mediator, pointGraphManager, configurations);
}

async function start(way: Way) {
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

  if (way === "mediator") {
    const mediatorScene = new MediatorScene(mediator, svgEngine);
  }
  const pointGraphManager = GetPointGraphManager(way, mediator, animationEngine);
  if (pointGraphManager) {
    const pointsScene = new PointsScene(mediator, svgEngine, pointGraphManager);
    const edgesScene = new EdgesScene(mediator, svgEngine, pointGraphManager);

    const enginePipeline = new EnginePipeline(mediator, animationEngine);
    const configurations: PhysicsConfigurations = {
      repulsion: new RepulsionEngineConfig(),
      graph: new GraphEngineConfig(),
      zdamping: new ZDampingConfig(),
    };

    await configurePipeline(enginePipeline, mediator, pointGraphManager, configurations);
  }
  createControlPanel(controlPanelDiv, mediator);
  createInfoPanel(infoPanelDiv, mediator);
}

function bootstrap() {
  start("levenshtein").catch(console.error);
}

bootstrap();
