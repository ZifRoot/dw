import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { RepulsionEngineConfig } from "../RepulsionAlgorithm";
import { WasmPointsTransformer } from "./WasmPointsTransformer";

const REPULSION_EXPORT = "repulsion";

export class WasmRepulsionAlgorithm extends BaseAlgorithm {
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: RepulsionEngineConfig,
    private readonly backend: WasmBackend,
    private readonly transformer: WasmPointsTransformer,
  ) {
    super(mediator);
  }

  public async initialize(memory: WebAssembly.Memory): Promise<void> {
    const sourceUrl = new URL("./repulsion.wasm", import.meta.url);
    this.instanceId = await this.backend.createInstance(sourceUrl, memory);
    this.transformer.attachInstance(this.instanceId);
  }

  protected applyStep(_deltaTime: number): number {
    const data = this.transformer.getData();

    return this.backend.invoke(this.getInstanceId(), REPULSION_EXPORT, [
      data.pointer,
      data.length,
      this.config.repulsionStrength,
      this.config.minDistance,
      this.config.targetDistance,
      this.config.epsilon,
      this.config.stopTemperature,
    ]);
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }

  public destroy(): void {
    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WASM Repulsion algorithm is not initialized.");
    }

    return this.instanceId;
  }
}
