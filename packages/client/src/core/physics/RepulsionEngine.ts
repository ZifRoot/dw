import { Point } from "../models/Point";
import { PointModel } from "../models/PointModel";

export class RepulsionEngineConfig {
  public repulsionStrength = 0.2;
  public minDistance = 1;
  public targetDistance = 100;
  public epsilon = 1e-6;
  public stopTemperature = 0.1;
}

export class RepulsionEngine {
  private targetDistSq: number;
  public points: PointModel[] = [];

  constructor(public config: RepulsionEngineConfig) {
    this.targetDistSq = config.targetDistance ** 2;
  }

  public setPoints(points: PointModel[]) {
    this.points = points;
  }

  /**
   * Выполнить один шаг физики.
   * Возвращает температуру шага.
   */
  public step(): number {
    return this.applyStep();
  }

  public applyPair1(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;

    if (p1.fixed && p2.fixed) return null;

    let d = p1.subNew(p2);
    const distSq = d.lenSq();
    if (distSq >= this.targetDistSq) return null;

    if (distSq < this.config.epsilon) {
      const shift = Point.RandomSphere().scale(minDistance);
      return { target1: p1.addNew(shift), target2: p2.subNew(shift) };
    }

    const dist = Math.sqrt(distSq);
    const unit = d.scaleNew(1 / dist);
    const delta = targetDistance - dist;

    if (p1.fixed) {
      return { target1: p1.clone(), target2: p2.addNew(unit.scaleNew(delta)) };
    }

    if (p2.fixed) {
      return { target1: p1.addNew(unit.scaleNew(-delta)), target2: p2.clone() };
    }

    const half = delta / 2;
    return {
      target1: p1.addNew(unit.scaleNew(-half)),
      target2: p2.addNew(unit.scaleNew(half)),
    };
  }

  applyPair2(p1: PointModel, p2: PointModel) {
    const fd = this.applyPair1(p1, p2);

    if (!fd) return -1;

    p1.smoothMove(fd.target1, this.config.repulsionStrength);
    p2.smoothMove(fd.target2, this.config.repulsionStrength);

    return (p1.distTo(fd.target1) + p2.distTo(fd.target2)) / this.config.targetDistance;
  }

  applyPair(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    const repulsionStrength = this.config.repulsionStrength;
    const stopTemperature2 = this.config.stopTemperature * 2;

    if (p1.fixed && p2.fixed) return -1;

    let d = p1.subNew(p2);
    const distSq = d.lenSq();

    if (distSq >= this.targetDistSq) return -1;

    let temperature: number;

    if (distSq < this.config.epsilon) {
      d = Point.RandomSphere().scale(minDistance);
      temperature = stopTemperature2;
    } else {
      const dist = Math.sqrt(distSq);
      const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
      const kk = targetDistance / dist - 1;
      const k = kk * factor * repulsionStrength;
      d.scale(k);
      temperature = Math.abs(kk);
    }

    if (!p1.fixed) p1.add(d);
    if (!p2.fixed) p2.sub(d);

    return temperature;
  }

  private applyStep(): number {
    const points = this.points;
    const len = points.length;
    let maxShift = -1;

    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        maxShift = Math.max(maxShift, this.applyPair(points[i], points[j]));
      }
    }

    return maxShift;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
