import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "../Engines/AnimationEngine";
import { PointModel } from "../models/PointModel";

export class ZDampingConfig {
  public dampingFactor = 0.999;
  public threshold = 1;
  public stopTemperature = 1;
}

export class ZDampingEngine {
  private temperature = 0;
  public points: PointModel[] = [];
  private unsubCallback: AnimationCallback | null = null;
  private readonly unsubStartRepulsion: () => void;

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: ZDampingConfig,
  ) {
    this.unsubStartRepulsion = mediator.onStartRepulsion(() => this.start());
  }

  public destroy(): void {
    this.stop();
    this.unsubStartRepulsion();
  }

  start() {
    this.unsubCallback ??= this.animation.addCallback(() => this.step());
  }

  stop() {
    if (this.unsubCallback != null) {
      this.unsubCallback();
      this.unsubCallback = null;
    }
  }

  public setPoints(points: PointModel[]) {
    this.points = points;
  }

  private step(): void {
    this.temperature = this.applyStep();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) {
      this.stop();
    }
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
