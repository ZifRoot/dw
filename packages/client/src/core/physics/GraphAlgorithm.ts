import { AppMediator } from "../AppMediator";
import { PointGraphManager } from "../collections/PointGraphManager";
import { Edge } from "../models/Edge";
import { BaseAlgorithm } from "../Engines/BaseAlgorithm";

export class GraphEngineConfig {
  public strength = 0.5;
  public targetDistance = 100 * 1.5;
  public stopTemperature = 0.1;
}

export class GraphAlgorithm extends BaseAlgorithm {
  constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: GraphEngineConfig,
  ) {
    super(mediator, pointGraphManager, config.stopTemperature);
  }

  public applyStep(_deltaTime: number): number {
    let maxShift = -1;

    for (const edge of this.pointGraphManager.getEdgesArray()) {
      if (!edge.physics) continue;

      maxShift = Math.max(maxShift, this.applyPair(edge));
    }

    return maxShift;
  }

  public applyPair(edge: Edge): number {
    const targetDistance = edge.distance;
    const targetDistSq = targetDistance ** 2;
    const p1 = edge.source;
    const p2 = edge.target;

    if (p1.fixed && p2.fixed) return -1;

    const d = p1.subNew(p2);
    const distSq = d.lenSq();
    if (distSq <= targetDistSq) return -1;

    const dist = Math.sqrt(distSq);
    const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
    const temp = 1 - targetDistance / dist;
    const k = temp * this.config.strength * factor;

    d.scale(k);
    if (!p1.fixed) p1.sub(d);
    if (!p2.fixed) p2.add(d);

    return temp;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
