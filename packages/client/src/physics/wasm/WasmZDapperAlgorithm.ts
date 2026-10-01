import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WasmPhysicsMemory } from "./WasmPhysicsMemory";

export class WasmZDapperAlgorithm extends BaseAlgorithm {
  constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly memory: WasmPhysicsMemory,
  ) {
    super(mediator, pointGraphManager);
  }

  protected applyStep(_deltaTime: number): number {
    return this.memory.applyZDamping(
      this.config.dampingFactor,
      this.config.threshold,
    );
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
