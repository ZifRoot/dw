import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WebGpuPhysicsMemory } from "./WebGpuPhysicsMemory";

export class WebGpuZDapperAlgorithm extends BaseAlgorithm {
  private executionPending = false;

  constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly memory: WebGpuPhysicsMemory,
  ) {
    super(mediator, pointGraphManager);
  }

  protected applyStep(_deltaTime: number): number {
    if (this.executionPending) {
      return 3;
    }

    const points = this.pointGraphManager
      .getPointsArray()
      .filter((point) => !point.fixed && Math.abs(point.z) > this.config.threshold);

    if (points.length === 0) {
      return 0;
    }

    this.executionPending = true;

    void this.memory
      .applyZDamping(this.config.dampingFactor, this.config.threshold)
      .catch((error: unknown) => {
        console.error("WebGPU Z-damping execution failed.", error);
        this.stop();
      })
      .finally(() => {
        this.executionPending = false;
      });

    return 3;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
