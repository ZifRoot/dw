import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "./AnimationEngine";
import { GraphEngine } from "../physics/GraphEngine";
import { RepulsionEngine } from "../physics/RepulsionEngine";
import { ZDampingEngine } from "../physics/ZDampingEngine";

interface PipelineEngine {
  step(): number;
  getStopTemperature(): number;
}

/**
 * Координирует физические движки.
 *
 * requestAnimationFrame остаётся ответственностью AnimationEngine.
 * Pipeline объединяет физические движки в один callback AnimationEngine.
 */
export class EnginePipeline {
  private readonly engines: Map<PipelineEngine, boolean> = new Map();
  private animationCallback: AnimationCallback | null = null;
  private destroyed = false;

  private readonly unsubStartRepulsion: () => void;
  private readonly unsubStartGraph: () => void;

  constructor(
    private readonly mediator: AppMediator,
    private readonly animation: AnimationEngine,
    graphEngine: GraphEngine,
    repulsionEngine: RepulsionEngine,
    zDampingEngine: ZDampingEngine,
  ) {
    this.engines.set(graphEngine, false);
    this.engines.set(repulsionEngine, false);
    this.engines.set(zDampingEngine, false);

    this.unsubStartRepulsion = mediator.onStartRepulsion(() => this.startAll());
    this.unsubStartGraph = mediator.onStartGraph(() => this.start(graphEngine));
  }

  public startAll(): void {
    if (this.destroyed) return;
    for (const engine of this.engines.keys()) {
      this.engines.set(engine, true);
    }
    this.ensureAnimation();
  }

  public start(engine: PipelineEngine): void {
    if (this.destroyed || !this.engines.has(engine)) return;
    this.engines.set(engine, true);
    this.ensureAnimation();
  }

  public stop(engine: PipelineEngine): void {
    if (!this.engines.has(engine)) return;
    this.engines.set(engine, false);
    if (!this.hasActiveEngines()) this.stopAnimation();
  }

  public stopAll(): void {
    for (const engine of this.engines.keys()) {
      this.engines.set(engine, false);
    }
    this.stopAnimation();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAll();
    this.unsubStartRepulsion();
    this.unsubStartGraph();
    this.engines.clear();
  }

  private ensureAnimation(): void {
    if (this.animationCallback !== null) return;
    this.animationCallback = this.animation.addCallback(() => this.step());
  }

  private stopAnimation(): void {
    if (this.animationCallback === null) return;
    this.animationCallback();
    this.animationCallback = null;
  }

  private step(): void {
    if (this.destroyed) return;

    let temperature = 0;

    for (const [engine, active] of this.engines) {
      if (!active) continue;

      const engineTemperature = engine.step();
      temperature = Math.max(temperature, engineTemperature);

      if (engineTemperature < engine.getStopTemperature()) {
        this.engines.set(engine, false);
      }
    }

    this.mediator.temperature = temperature;

    if (!this.hasActiveEngines()) this.stopAnimation();
  }

  private hasActiveEngines(): boolean {
    for (const active of this.engines.values()) {
      if (active) return true;
    }
    return false;
  }
}
