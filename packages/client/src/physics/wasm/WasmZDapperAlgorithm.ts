import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WasmPointsTransformer } from "./WasmPointsTransformer";

const Z_DAMPING_EXPORT = "z_damping";

export class WasmZDapperAlgorithm extends BaseAlgorithm {
  private instanceId: number | null = null;

  public constructor(mediator: AppMediator, public readonly config: ZDampingConfig, private readonly backend: WasmBackend, private readonly transformer: WasmPointsTransformer) {
    super(mediator);
  }

  public async initialize(memory: WebAssembly.Memory): Promise<void> {
    const sourceUrl = new URL("./z-damping.wasm", import.meta.url);
    this.instanceId = await this.backend.createInstance(sourceUrl, memory);
    this.transformer.attachInstance(this.instanceId);
  }

  protected applyStep(_deltaTime: number): number {
    const data = this.transformer.getData();
    return this.backend.invoke(this.getInstanceId(), Z_DAMPING_EXPORT, [
      data.pointer, data.length, this.config.dampingFactor, this.config.threshold,
    ]);
  }

  public getStopTemperature(): number { return this.config.stopTemperature; }

  public destroy(): void {
    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }
  }

  private getInstanceId(): number {
    if (this.instanceId === null) throw new Error("WASM Z-damping algorithm is not initialized.");
    return this.instanceId;
  }
}
