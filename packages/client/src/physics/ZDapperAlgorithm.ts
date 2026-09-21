import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";

export class ZDampingConfig {
  public dampingFactor = 0.999;
  public threshold = 1;
  public stopTemperature = 1;
}

export class ZDapperAlgorithm extends BaseAlgorithm {
  constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
  ) {
    super(mediator, pointGraphManager);
  }

  public applyStep(_deltaTime: number): number {
    const { dampingFactor, threshold } = this.config;
    let temperature = 0;

    for (const point of this.pointGraphManager.getPointsArray()) {
      if (point.fixed || Math.abs(point.z) <= threshold) continue;

      point.smoothMove({ x: point.x, y: point.y, z: 0 }, dampingFactor);
      temperature = 3;
      if (Math.abs(point.z) < 1e-6) point.z = 0;
    }
    return temperature;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
