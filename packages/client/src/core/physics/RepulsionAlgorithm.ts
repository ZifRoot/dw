import { AppMediator } from "../AppMediator";
import { PointGraphManager } from "../collections/PointGraphManager";
import { PointMath } from "../models/PointMath";
import { PointModel } from "../models/PointModel";
import { BaseAlgorithm } from "../Engines/BaseAlgorithm";

export class RepulsionEngineConfig {
  public repulsionStrength = 0.2;
  public minDistance = 1;
  public targetDistance = 100;
  public epsilon = 1e-6;
  public stopTemperature = 0.1;
}

export class RepulsionAlgorithm extends BaseAlgorithm {
  constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: RepulsionEngineConfig,
  ) {
    super(mediator, pointGraphManager, config.stopTemperature);
  }

  public applyPair1(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    if (p1.fixed && p2.fixed) return null;

    const d = p1.subNew(p2);
    const distSq = d.lenSq();
    if (distSq >= targetDistance ** 2) return null;

    if (distSq < this.config.epsilon) {
      const shift = PointMath.RandomSphere().scale(minDistance);
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
    return { target1: p1.addNew(unit.scaleNew(-half)), target2: p2.addNew(unit.scaleNew(half)) };
  }

  public applyPair2(p1: PointModel, p2: PointModel) {
    const force = this.applyPair1(p1, p2);
    if (!force) return -1;

    p1.smoothMove(force.target1, this.config.repulsionStrength);
    p2.smoothMove(force.target2, this.config.repulsionStrength);
    return (p1.distTo(force.target1) + p2.distTo(force.target2)) / this.config.targetDistance;
  }

  public applyPair(p1: PointModel, p2: PointModel): number {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    const repulsionStrength = this.config.repulsionStrength;
    const stopTemperature = this.config.stopTemperature;

    if (p1.fixed && p2.fixed) return -1;

    let d = p1.subNew(p2);
    const distSq = d.lenSq();
    if (distSq >= targetDistance ** 2) return -1;

    let temperature: number;
    if (distSq < this.config.epsilon) {
      d = PointMath.RandomSphere().scale(minDistance);
      temperature = stopTemperature * 2;
    } else {
      const dist = Math.sqrt(distSq);
      const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
      const relativeDistance = targetDistance / dist - 1;
      d.scale(relativeDistance * factor * repulsionStrength);
      temperature = Math.abs(relativeDistance);
    }

    if (!p1.fixed) p1.add(d);
    if (!p2.fixed) p2.sub(d);
    return temperature;
  }

  public applyStep(_deltaTime: number): number {
    const points = this.pointGraphManager.getPointsArray();
    let maxShift = -1;

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        maxShift = Math.max(maxShift, this.applyPair(points[i], points[j]));
      }
    }

    return maxShift;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
