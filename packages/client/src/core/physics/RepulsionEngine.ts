import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "../Engines/AnimationEngine";
import { Point } from "../models/Point";

import { PointModel } from "../models/PointModel";

export class RepulsionEngineConfig {
  public repulsionStrength = 0.2;
  public minDistance = 1e-3;
  public targetDistance = 100;
  public epsilon = 1e-6;
  public stopTemperature = 0.1;
}

export class RepulsionEngine {
  private temperature = 0;
  private targetDistSq: number;
  public points: PointModel[] = [];
  unsubCallback: AnimationCallback | null = null;

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: RepulsionEngineConfig,
  ) {
    this.targetDistSq = config.targetDistance ** 2;
    mediator.onStartRepulsion(() => this.start());
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
    this.mediator.updatePoints();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) {
      this.stop();
    }
  }

  applyPair(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    const repulsionStrength = this.config.repulsionStrength;
    const stopTemperature2 = this.config.stopTemperature * 2;
    // Быстрая проверка: оба фиксированы – пропускаем
    if (p1.fixed && p2.fixed) return -1;

    let d = p1.subNew(p2);

    const distSq = d.lenSq();
    if (distSq >= this.targetDistSq) return -1;

    let temperature: number;

    if (distSq < this.config.epsilon) {
      // Случайное расталкивание при нулевом расстоянии
      d = Point.RandomSphere().scale(minDistance);
      temperature = stopTemperature2;
    } else {
      const dist = Math.sqrt(distSq);
      // Коэффициент силы с учётом фиксации
      const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
      const kk = targetDistance / dist - 1;
      const k = kk * factor * repulsionStrength;
      d.scale(k);
      temperature = Math.abs(kk);
    }

    if (!p1.fixed) {
      p1.add(d);
    }
    if (!p2.fixed) {
      p2.sub(d);
    }
    return 0;
  }

  private applyStep(): number {
    const points = this.points;
    const len = points.length;
    let maxShift = -1;

    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const temperature = this.applyPair(points[i], points[j]);
        maxShift = Math.max(maxShift, temperature);
      }
    }
    return maxShift;
  }
}
