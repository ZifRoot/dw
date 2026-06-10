import { AppMediator } from "../AppMediator";
import { AnimationEngine } from "../Engines/AnimationEngine";
import { Point } from "../models/Point";

/**
 * Отвечает только за отталкивание точек (репульсию).
 * Не знает о рендеринге или флагах.
 */
export class RepulsionEngine {
  public repulsionStrength = 0.7;
  public minDistancePx = 1e-3;
  public needDist = 100;
  public needDistSq: number;
  public epsilon = 1e-6;
  public temperature = 0;
  animation: AnimationEngine;
  points!: Point[];

  constructor(
    public mediator: AppMediator,
    public needTemperature: number = 0.4,
  ) {
    this.needDistSq = this.needDist * this.needDist;
    this.animation = new AnimationEngine();
    this.animation.setCallback(() => this.Ax());
    this.mediator.onStartRepulsion(() => this.start());
  }

  start() {
    this.animation.start();
  }

  setPoints(points: Point[]) {
    this.points = points;
  }
  Ax(): void {
    this.temperature = this.applyRepulsionStep(this.points);
    this.mediator.updatePoints();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.needTemperature) this.animation.stop();
  }

  public applyRepulsionStep(points: Point[]): number {
    let maxShift = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (points[i].fixed && points[j].fixed) continue;
        const shift = this.applyRepulsionToPair(points[i], points[j]);
        if (shift > maxShift) maxShift = shift;
      }
    }
    return maxShift;
  }

  public applyRepulsionToPair(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= this.needDistSq) return 0;

    let sx: number;
    let sy: number;
    let t: number;
    if (distSq < this.epsilon) {
      const angle = Math.random() * 2 * Math.PI;
      const r = this.minDistancePx;
      sx = Math.cos(angle) * r;
      sy = Math.sin(angle) * r;
      t = this.needTemperature * 2;
    } else {
      const dist = Math.sqrt(distSq);

      const l = p1.fixed || p2.fixed || false ? 1 : 0.5;
      let k = (this.needDist / dist - 1) * l * this.repulsionStrength;
      t = (this.needDist - dist) / this.needDist;
      sx = dx * k;
      sy = dy * k;
    }
    if (!p1.fixed) {
      p1.x += sx;
      p1.y += sy;
    }
    if (!p2.fixed) {
      p2.x -= sx;
      p2.y -= sy;
    }
    return t;
  }

  public updateTemperature(maxShift: number): void {
    this.temperature = maxShift / this.minDistancePx;
  }
}
