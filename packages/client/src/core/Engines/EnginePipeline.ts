import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "./AnimationEngine";
import { BaseAlgorithm } from "./BaseAlgorithm";

export interface EnginePipelineEntry {
  /** Человекочитаемое название экземпляра алгоритма в UI. */
  name: string;
  algorithm: BaseAlgorithm;
  enabled?: boolean;
}

export interface EnginePipelineConfigChange {
  pipelineName: string;
  engineName: string;
  changes: Record<string, unknown>;
}

/**
 * Описывает набор алгоритмов и порядок их выполнения.
 *
 * Pipeline отвечает за ЧТО и В КАКОМ ПОРЯДКЕ выполнять.
 * AnimationEngine отвечает за КОГДА и как распределить выполнение по кадрам.
 */
export class EnginePipeline {
  private entries: EnginePipelineEntry[] = [];
  private disposeCallbacks: (() => void) | null = null;
  private running = false;
  private destroyed = false;
  private readonly unsubscribeStart: () => void;
  private readonly unsubscribeConfig: () => void;
  private readonly unsubscribeEnabled: () => void;

  constructor(
    private readonly mediator: AppMediator,
    private readonly animation: AnimationEngine,
    private readonly name: string,
  ) {
    this.unsubscribeStart = this.mediator.onStartRepulsion(() => this.start());
    this.unsubscribeConfig = this.mediator.onPipelineEngineConfigChanged((change) => {
      if (change.pipelineName !== this.name) return;

      const entry = this.entries.find((item) => item.name === change.engineName);
      if (!entry) return;

      Object.assign(entry.algorithm.config, change.changes);
    });

    this.unsubscribeEnabled = this.mediator.onPipelineEngineEnabledChanged((change) => {
      if (change.pipelineName !== this.name) return;
      this.setEnabled(change.engineName, change.enabled);
    });
  }

  /** Возвращает человекочитаемое название pipeline. */
  public get pipelineName(): string {
    return this.name;
  }

  /** Установить алгоритмы и их порядок. Повтор одного алгоритма разрешён. */
  public setConfiguration(entries: EnginePipelineEntry[]): void {
    if (this.destroyed) return;
    this.stop();
    this.entries = entries.map((entry) => ({
      name: entry.name,
      algorithm: entry.algorithm,
      enabled: entry.enabled ?? true,
    }));
  }

  /** Включить или выключить алгоритм по его имени. */
  public setEnabled(engineName: string, enabled: boolean): void {
    const entry = this.entries.find((item) => item.name === engineName);
    if (!entry || entry.enabled === enabled) return;

    entry.enabled = enabled;
    if (enabled) {
      if (this.running) entry.algorithm.start();
    } else {
      entry.algorithm.stop();
    }
    if (this.running) this.rebuild();
  }

  /** Запустить все включённые алгоритмы. */
  public start(): void {
    if (this.destroyed) return;
    for (const entry of this.entries) {
      if (entry.enabled) entry.algorithm.start();
    }
    this.running = true;
    this.rebuild();
  }

  /** Остановить pipeline и снять его регистрацию из AnimationEngine. */
  public stop(): void {
    this.disposeCallbacks?.();
    this.disposeCallbacks = null;
    this.running = false;
    for (const entry of this.entries) entry.algorithm.stop();
  }

  /** Освободить все подписки. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.unsubscribeStart();
    this.unsubscribeConfig();
    this.unsubscribeEnabled();
  }

  private rebuild(): void {
    this.disposeCallbacks?.();
    this.disposeCallbacks = null;

    const callbacks: AnimationCallback[] = [];
    for (const entry of this.entries) {
      if (!entry.enabled) continue;
      callbacks.push((deltaTime) => entry.algorithm.step(deltaTime));
    }

    if (callbacks.length === 0) {
      this.running = false;
      return;
    }

    callbacks.push((deltaTime) => {
      this.mediator.pointsUpdating();
      const activeEntries = this.entries.filter((entry) => entry.enabled);
      if (activeEntries.length > 0 && activeEntries.every((entry) => !entry.algorithm.isRunning)) {
        this.stop();
      }
    });

    this.disposeCallbacks = this.animation.addCallbacks(callbacks);
  }
}
