import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { GraphEngineConfig } from "../GraphAlgorithm";
import { WasmPointsTransformer } from "./WasmPointsTransformer";
import { WasmEdgesTransformer } from "./WasmEdgesTransformer";

const GRAPH_EXPORT = "graph";

export class WasmGraphAlgorithm extends BaseAlgorithm {
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: GraphEngineConfig,
    private readonly backend: WasmBackend,
    private readonly pointsTransformer: WasmPointsTransformer,
    private readonly edgesTransformer: WasmEdgesTransformer,
  ) {
    super(mediator);
  }

  public async initialize(memory: WebAssembly.Memory): Promise<void> {
    const sourceUrl = new URL("./graph.wasm", import.meta.url);
    this.instanceId = await this.backend.createInstance(sourceUrl, memory);
    this.pointsTransformer.attachInstance(this.instanceId);
    this.edgesTransformer.attachInstance(this.instanceId);
  }

  protected applyStep(_deltaTime: number): number {
    const points = this.pointsTransformer.getData();
    const edges = this.edgesTransformer.load();

    return this.backend.invoke(this.getInstanceId(), GRAPH_EXPORT, [
      points.pointer,
      points.length,
      edges.pointer,
      edges.length,
      this.config.strength,
    ]);
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }

  public destroy(): void {
    this.edgesTransformer.destroy();

    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WASM Graph algorithm is not initialized.");
    }

    return this.instanceId;
  }
}
