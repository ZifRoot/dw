import { AppMediator } from "../AppMediator";
import { AnimationEngine } from "../Engines/AnimationEngine";
import { Point } from "../models/Point";

export class AttractionEngineConfig {
  public attractionStrength = 0.5;
  public targetDistance = 100;
  public stopTemperature = 0.01;
}

export class AttractionEngine {
  private targetDistSq: number;
  public points: Point[] = [];

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: AttractionEngineConfig,
  ) {
    this.targetDistSq = config.targetDistance ** 2;
    mediator.onStartGraph(() => this.animation.setCallback(() => this.step()));
  }

  public start() {
    this.animation.start();
  }

  public setPoints(points: Point[]) {
    this.points = points;
  }

  private step(): void {
    const temperature = this.applyAttractionStep();
    this.mediator.updatePoints();
    this.mediator.temperature = temperature;
    if (temperature < this.config.stopTemperature) {
      this.animation.setCallback(null);
    }
  }

  private applyAttractionStep(): number {
    const points = this.points;
    const n = points.length;
    const targetDistance = this.config.targetDistance;
    const targetDistSq = this.targetDistSq;
    const strength = this.config.attractionStrength;

    let maxShift = -1;

    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      for (let j = i + 1; j < n; j++) {
        const p2 = points[j];
        if (p1.fixed && p2.fixed) continue;

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= targetDistSq) continue;

        const dist = Math.sqrt(distSq);
        const delta = (dist - targetDistance) * strength;
        const k = delta / dist;
        const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
        const shiftX = dx * k * factor;
        const shiftY = dy * k * factor;
        const temp = (dist - targetDistance) / dist;

        if (!p1.fixed) {
          p1.x -= shiftX;
          p1.y -= shiftY;
        }
        if (!p2.fixed) {
          p2.x += shiftX;
          p2.y += shiftY;
        }

        if (temp > maxShift) maxShift = temp;
      }
    }
    return maxShift;
  }
}
