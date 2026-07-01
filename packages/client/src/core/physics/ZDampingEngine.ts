import { AppMediator } from "../AppMediator";
import { Point } from "../models/Point";

export class ZDampingConfig {
  public dampingFactor = 0.999;
  public threshold = 500;
}

export class ZDampingEngine {
  constructor(
    private mediator: AppMediator,
    private config: ZDampingConfig = new ZDampingConfig(),
  ) {
    // Подписываемся на частое событие обновления точек
    this.mediator.onPointsUpdating((points: Point[]) => {
      this.step(points);
    });
  }

  private step(points: Point[]): void {
    const { dampingFactor, threshold } = this.config;
    for (const p of points) {
      if (p.fixed) continue;
      if (Math.abs(p.z) > threshold) {
        p.z *= dampingFactor;
        if (Math.abs(p.z) < 1e-6) p.z = 0;
      }
    }
  }
}