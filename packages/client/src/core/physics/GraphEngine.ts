import { AppMediator } from "../AppMediator";
import { AnimationEngine } from "../Engines/AnimationEngine";
import { Edge } from "../models/Edge";

export class GraphEngineConfig {
  public strength = 0.5;
  public targetDistance = 101;
  public stopTemperature: number = 0.1;
}

export class GraphEngine {
  private temperature = 0;
  private targetDistSq: number;

  edges!: Edge[];

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: GraphEngineConfig,
  ) {
    this.targetDistSq = this.config.targetDistance ** 2;
    this.mediator.onStartRepulsion(() => this.animation.setCallback(() => this.step()));
  }

  start() {
    this.animation.start();
  }

  setEdges(edges: Edge[]) {
    this.edges = edges;
  }

  step(): void {
    this.temperature = this.applyRepulsionStep();
    this.mediator.updatePoints();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) this.animation.setCallback(null);
  }

  public applyRepulsionStep(): number {
    let maxShift = -1;
    const targetDistance = this.config.targetDistance;
    const targetDistSq = this.targetDistSq;
    const strength = this.config.strength;
    for (let i = 0; i < this.edges.length; i++) {
      let edge = this.edges[i];
      const p1 = edge.source;
      const p2 = edge.target;
      if (p1.fixed && p2.fixed) continue;

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= targetDistSq) continue;

      const dist = Math.sqrt(distSq);

      const k = (1 - targetDistance / dist) * strength;
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
    return maxShift;
  }

  public applyRepulsionToPair(edge: Edge): number {
    const p1 = edge.source;
    const p2 = edge.target;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= this.targetDistSq) return 0;

    let sx: number;
    let sy: number;
    let t: number;

    const dist = Math.sqrt(distSq);
    const f2 = p1.fixed || p2.fixed || false ? 1 : 0.5;
    let k = (this.config.targetDistance / dist - 1) * f2 * this.config.strength;
    sx = dx * k;
    sy = dy * k;
    t = 1 - dist / this.config.targetDistance;

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
}
