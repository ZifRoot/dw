import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "../Engines/AnimationEngine";
import { Edge, EdgeModel } from "../models/Edge";

export class GraphEngineConfig {
  public strength = 0.5;
  public targetDistance = 101;
  public stopTemperature: number = 0.1;
}

export class GraphEngine {
  private temperature = 0;
  private targetDistSq: number;

  edges!: EdgeModel[];
  unsubCallback: AnimationCallback | null = null;

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: GraphEngineConfig,
  ) {
    this.targetDistSq = this.config.targetDistance ** 2;
    this.mediator.onStartRepulsion(() => this.start());
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

  setEdges(edges: EdgeModel[]) {
    this.edges = edges;
  }

  step(): void {
    this.temperature = this.applyStep();
    this.mediator.updatePoints();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) {
      this.stop();
    }
  }

  public applyStep(): number {
    let maxShift = -1;
    for (let i = 0; i < this.edges.length; i++) {
      let edge = this.edges[i];

      let temp = this.applyPair(edge);
      maxShift = Math.max(maxShift, temp);
    }
    return maxShift;
  }

  public applyPair(edge: EdgeModel): number {
    const targetDistance = this.config.targetDistance;
    const targetDistSq = this.targetDistSq;
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
}
