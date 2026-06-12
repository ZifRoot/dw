import { AppMediator } from "../AppMediator";
import { AnimationEngine } from "../Engines/AnimationEngine";
import { Point } from "../models/Point";

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
  public points: Point[] = [];

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: RepulsionEngineConfig,
  ) {
    this.targetDistSq = config.targetDistance ** 2;
    mediator.onStartRepulsion(() => this.animation.setCallback(() => this.step()));
  }

  public start() {
    this.animation.start();
  }

  public setPoints(points: Point[]) {
    this.points = points;
  }

  private step(): void {
    this.temperature = this.applyRepulsionStep();
    this.mediator.updatePoints();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) {
      this.animation.setCallback(null);
    }
  }

  private applyRepulsionStep(): number {
    const points = this.points;
    const len = points.length;
    let maxShift = -1;
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    const repulsionStrength = this.config.repulsionStrength;
    const stopTemperature2 = this.config.stopTemperature * 2;
    for (let i = 0; i < len; i++) {
      const p1 = points[i];
      for (let j = i + 1; j < len; j++) {
        const p2 = points[j];

        // Быстрая проверка: оба фиксированы – пропускаем
        if (p1.fixed && p2.fixed) continue;

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= this.targetDistSq) continue;

        let shiftX: number, shiftY: number;
        let temperature: number;

        if (distSq < this.config.epsilon) {
          // Случайное расталкивание при нулевом расстоянии
          const angle = Math.random() * 2 * Math.PI;
          const r = minDistance;
          shiftX = Math.cos(angle) * r;
          shiftY = Math.sin(angle) * r;
          temperature = stopTemperature2;
        } else {
          const dist = Math.sqrt(distSq);
          // Коэффициент силы с учётом фиксации
          let factor: number;
          if (p1.fixed || p2.fixed)
            factor = 1.0; // одна фиксирована – вся сила на подвижную
          else factor = 0.5; // обе подвижны – сила делится

          const k = (targetDistance / dist - 1) * factor * repulsionStrength;
          shiftX = dx * k;
          shiftY = dy * k;
          temperature = Math.abs(1 - dist / targetDistance);
        }

        if (!p1.fixed) {
          p1.x += shiftX;
          p1.y += shiftY;
        }
        if (!p2.fixed) {
          p2.x -= shiftX;
          p2.y -= shiftY;
        }

        if (temperature > maxShift) maxShift = temperature;
      }
    }
    return maxShift;
  }
}
