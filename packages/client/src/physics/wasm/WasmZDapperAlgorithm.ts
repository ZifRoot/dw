import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WasmBackend } from "@core/Backends/WasmBackend";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WasmPointsTransformer } from "./WasmPointsTransformer";

const Z_DAMPING_EXPORT = "z_damping";

export class WasmZDapperAlgorithm extends BaseAlgorithm {
  public constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly backend: WasmBackend,
    private readonly transformer: WasmPointsTransformer,
    public readonly sourceUrl: URL,
  ) {
    super(mediator, pointGraphManager);
  }

  protected applyStep(_deltaTime: number): number {
    const data = this.transformer.load();

    const temperature = this.backend.invoke(Z_DAMPING_EXPORT, [
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
}
