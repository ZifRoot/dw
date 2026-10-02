import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WasmPointsTransformer } from "./WasmPointsTransformer";

const Z_DAMPING_EXPORT = "z_damping";

export class WasmZDapperAlgorithm extends BaseAlgorithm {
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: ZDampingConfig,
    private readonly backend: WasmBackend,
    private readonly transformer: WasmPointsTransformer,
  ) {
    super(mediator);
  }

  public async initialize(): Promise<void> {
    const sourceUrl = new URL("./z-damping.cpp", import.meta.url);
    const instanceId = await this.backend.createInstance(sourceUrl);
    this.instanceId = instanceId;
    this.transformer.attachInstance(instanceId);
  }

  protected applyStep(_deltaTime: number): number {
    const instanceId = this.getInstanceId();
    const data = this.transformer.load();

    const temperature = this.backend.invoke(instanceId, Z_DAMPING_EXPORT, [
      data.pointer,
      data.length,
      this.config.dampingFactor,
      this.config.threshold,
    ]);

    this.transformer.save();
    return temperature;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }

  public destroy(): void {
    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }

    this.transformer.destroy();
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WASM Z-damping algorithm is not initialized.");
    }

    return this.instanceId;
  }
}
