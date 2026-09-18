import { PointModel } from "../models/PointModel";

export class ZDampingConfig {
  public dampingFactor = 0.999;
  public threshold = 1;
  public stopTemperature = 1;
  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}

export class ZDampingEngine {
  public points: PointModel[] = [];

  constructor(public config: ZDampingConfig) {}


  public setPoints(points: PointModel[]) {
    this.points = points;
  }

  public step(): number {
    return this.applyStep();
  }

  private applyStep(): number {
    const { dampingFactor, threshold } = this.config;
    let t = 0;
    for (const p of this.points) {
      if (p.fixed) continue;
      if (Math.abs(p.z) > threshold) {
        p.smoothMove({ x: p.x, y: p.y, z: 0 }, dampingFactor);
        t = 3;
        if (Math.abs(p.z) < 1e-6) p.z = 0;
      }
    }
    return t;
  }
}
