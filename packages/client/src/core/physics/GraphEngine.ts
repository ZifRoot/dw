import { EdgeModel } from "../models/EdgeModel";

export class GraphEngineConfig {
  public strength = 0.5;
  public targetDistance = 100 * 1.5;
  public stopTemperature: number = 0.1;
}

export class GraphEngine {
  edges!: EdgeModel[];

  constructor(public config: GraphEngineConfig) {}


  setEdges(edges: EdgeModel[]) {
    this.edges = edges;
  }

  public step(): number {
    return this.applyStep();
  }

  public applyStep(): number {
    let maxShift = -1;
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];

      const temp = this.applyPair(edge);
      maxShift = Math.max(maxShift, temp);
    }
    return maxShift;
  }

  public applyPair(edge: EdgeModel): number {
    const targetDistance = edge.distance;
    const targetDistSq = targetDistance ** 2;
    const strength = this.config.strength;
    const p1 = edge.source;
    const p2 = edge.target;

    if (p1.fixed && p2.fixed) return -1;

    const d = p1.subNew(p2);
    const distSq = d.lenSq();

    if (distSq <= targetDistSq) return -1;

    const dist = Math.sqrt(distSq);

    const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
    const temp = 1 - targetDistance / dist;
    const k = temp * strength * factor;

    d.scale(k);

    if (!p1.fixed) {
      p1.sub(d);
    }

    if (!p2.fixed) {
      p2.add(d);
    }

    return temp;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
