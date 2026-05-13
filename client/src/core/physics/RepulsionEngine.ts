import { Point } from "../Point";
import { mxy } from "./PhysicsUtils";

/**
 * Отвечает только за отталкивание точек (репульсию).
 * Не знает о рендеринге или флагах.
 */
export class RepulsionEngine {
  public repulsionStrength = 0.5;
  public minDistancePx = 200;
  public minDistanceSq = this.minDistancePx * this.minDistancePx;
  public epsilon = 1e-6;
  public temperature = 0;

  public applyRepulsionStep(points: Point[]): number {
    let maxShift = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const shift = this.applyRepulsionToPair(points[i], points[j]);
        if (shift > maxShift) maxShift = shift;
      }
    }
    return maxShift;
  }

  private applyRepulsionToPair(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= this.minDistanceSq) return 0;
    const dist = Math.sqrt(distSq);
    const overlap = this.minDistancePx - dist;
    const force = overlap * this.repulsionStrength;
    const { moveX, moveY } = mxy(dist, dx, dy, force, this.epsilon, this.minDistancePx);
    p1.x += moveX;
    p1.y += moveY;
    p2.x -= moveX;
    p2.y -= moveY;
    return Math.hypot(moveX, moveY);
  }

  public updateTemperature(maxShift: number): void {
    this.temperature = maxShift / this.minDistancePx;
  }
}
