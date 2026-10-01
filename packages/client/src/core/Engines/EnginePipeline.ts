import { EventCoagulator } from "@utils/event-coagulator";
import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "./AnimationEngine";
import { BaseAlgorithm } from "./BaseAlgorithm";

export type EnginePipelineTemperatureAggregation = "maximum" | "average";

const MAX_SKIP_FRAMES = 30;
const TEMPERATURE_SKIP_RANGE = 1;
const TEMPERATURE_UI_DELAY_MS = 100;
const POINTS_UPDATED_INTERVAL_MS = 5000;

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
 *
 * Температура является результатом шага конкретной physics.
 * Pipeline собирает температуры physics и только здесь публикует
 * агрегированную температуру наружу.
 */
export class EnginePipeline {
  private entries: EnginePipelineEntry[] = [];
  private disposeCallbacks: (() => void) | null = null;
  private running = false;
  private destroyed = false;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private readonly skipFrames = new Map<BaseAlgorithm, number>();
  private readonly temperatureCoagulator: EventCoagulator<number>;
  private temperatureAggregation: EnginePipelineTemperatureAggregation = "maximum";
  private lastPointsUpdatedAt = 0;

  private readonly unsubscribeStart: () => void;
  private readonly unsubscribeConfig: () => void;
  private readonly unsubscribeEnabled: () => void;

  constructor(
    private readonly mediator: AppMediator,
    private readonly animation: AnimationEngine,
    private readonly name: string,
  ) {
    this.temperatureCoagulator = new EventCoagulator(TEMPERATURE_UI_DELAY_MS, "latest", (temperature) => {
      this.mediator.temperature = temperature;
    });

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
    this.skipFrames.clear();
  }

  /**
   * Возвращает снимок конфигурации pipeline для UI.
   * Внутренний массив entries наружу не передаётся.
   */
  public getConfiguration(): ReadonlyArray<{
    name: string;
    enabled: boolean;
    config: Readonly<Record<string, unknown>>;
  }> {
    return this.entries.map((entry) => ({
      name: entry.name,
      enabled: entry.enabled ?? true,
      config: { ...entry.algorithm.config },
    }));
  }

  /** Возвращает способ агрегации температур physics. */
  public get temperatureMode(): EnginePipelineTemperatureAggregation {
    return this.temperatureAggregation;
  }

  /** Установить способ агрегации температур physics. */
  public setTemperatureAggregation(mode: EnginePipelineTemperatureAggregation): void {
    this.temperatureAggregation = mode;
    this.publishTemperature();
  }

  /** Включить или выключить алгоритм по его имени. */
  public setEnabled(engineName: string, enabled: boolean): void {
    const entry = this.entries.find((item) => item.name === engineName);
    if (!entry || entry.enabled === enabled) return;

    entry.enabled = enabled;
    if (enabled) {
      if (this.running) {
        entry.algorithm.start();
        this.skipFrames.set(entry.algorithm, 0);
      }
    } else {
      entry.algorithm.stop();
      this.skipFrames.delete(entry.algorithm);
    }

    if (this.running) this.rebuild();
  }

  /** Запустить все включённые алгоритмы. */
  public start(): void {
    if (this.destroyed) return;

    for (const entry of this.entries) {
      if (!entry.enabled) continue;

      entry.algorithm.start();
      this.skipFrames.set(entry.algorithm, 0);
    }

    const activeEntries = this.entries.filter((entry) => entry.enabled);
    if (activeEntries.length === 0) {
      this.running = false;
      this.stopCheckpointTimer();
      return;
    }

    this.running = true;
    this.lastPointsUpdatedAt = 0;
    this.startCheckpointTimer();
    this.rebuild();
  }

  /**
   * Остановить pipeline и снять его регистрацию из AnimationEngine.
   *
   * Вызов stop() является технической остановкой pipeline. Событие
   * Points Updated здесь намеренно не публикуется: оно означает именно
   * завершение физического расчёта.
   */
  public stop(): void {
    this.disposeCallbacks?.();
    this.disposeCallbacks = null;
    this.running = false;
    this.stopCheckpointTimer();

    for (const entry of this.entries) {
      entry.algorithm.stop();
    }
  }

  /** Освободить все подписки и ресурсы pipeline. */
  public destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stop();
    this.temperatureCoagulator.dispose();
    this.unsubscribeStart();
    this.unsubscribeConfig();
    this.unsubscribeEnabled();
  }

  private rebuild(): void {
    this.disposeCallbacks?.();
    this.disposeCallbacks = null;

    const callbacks: AnimationCallback[] = [];
    let didExecutePhysics = false;

    for (const entry of this.entries) {
      if (!entry.enabled) continue;

      callbacks.push((deltaTime) => {
        if (!entry.algorithm.isRunning) return;

        const remainingSkipFrames = this.skipFrames.get(entry.algorithm) ?? 0;
        if (remainingSkipFrames > 0) {
          this.skipFrames.set(entry.algorithm, remainingSkipFrames - 1);
          return;
        }

        entry.algorithm.step(deltaTime);
        didExecutePhysics = true;
        this.skipFrames.set(entry.algorithm, this.calculateSkipFrames(entry.algorithm));
      });
    }

    if (callbacks.length === 0) {
      this.running = false;
      this.stopCheckpointTimer();
      return;
    }

    callbacks.push(() => {
      if (!didExecutePhysics) return;

      this.publishTemperature();
      this.mediator.pointsUpdating();

      const activeEntries = this.entries.filter((entry) => entry.enabled);
      if (activeEntries.length > 0 && activeEntries.every((entry) => !entry.algorithm.isRunning)) {
        this.finishRun();
      }

      didExecutePhysics = false;
    });

    this.disposeCallbacks = this.animation.addCallbacks(callbacks);
  }

  /**
   * Рассчитать количество кадров, которое physics может пропустить.
   *
   * Между stopTemperature и stopTemperature * 2 используется инвертированная
   * шкала: чем ближе температура к stopTemperature, тем больше skipFrames.
   * Выше диапазона physics выполняется каждый кадр.
   */
  private calculateSkipFrames(algorithm: BaseAlgorithm): number {
    const stopTemperature = algorithm.getStopTemperature();
    const temperature = algorithm.temperature;

    if (!Number.isFinite(stopTemperature) || !Number.isFinite(temperature) || stopTemperature <= 0 || temperature <= stopTemperature) {
      return 0;
    }

    const normalizedDistance = (temperature - stopTemperature) / (stopTemperature * TEMPERATURE_SKIP_RANGE);

    if (normalizedDistance >= 1) return 0;

    const skip = Math.floor((1 - Math.max(0, normalizedDistance)) * MAX_SKIP_FRAMES);

    return Math.max(0, Math.min(MAX_SKIP_FRAMES, skip));
  }

  /** Агрегировать температуры всех включённых physics и отправить их в UI. */
  private publishTemperature(): void {
    const temperatures = this.entries.filter((entry) => entry.enabled).map((entry) => entry.algorithm.temperature);

    if (temperatures.length === 0) {
      this.temperatureCoagulator.push(0);
      return;
    }

    const temperature =
      this.temperatureAggregation === "average"
        ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
        : Math.max(...temperatures);

    this.temperatureCoagulator.push(temperature);
  }

  /** Запустить периодические checkpoints. */
  private startCheckpointTimer(): void {
    this.stopCheckpointTimer();

    this.checkpointTimer = setInterval(() => {
      if (!this.running) return;
      this.emitPointsUpdated();
    }, POINTS_UPDATED_INTERVAL_MS);
  }

  private stopCheckpointTimer(): void {
    if (this.checkpointTimer === null) return;

    clearInterval(this.checkpointTimer);
    this.checkpointTimer = null;
  }

  /** Публиковать Points Updated не чаще одного раза за checkpoint interval. */
  private emitPointsUpdated(): void {
    const now = Date.now();
    if (now - this.lastPointsUpdatedAt < POINTS_UPDATED_INTERVAL_MS) return;

    this.lastPointsUpdatedAt = now;
    this.mediator.pointsUpdated();
  }

  /** Завершить один фактический цикл физического расчёта. */
  private finishRun(): void {
    if (!this.running) return;

    this.publishTemperature();
    this.temperatureCoagulator.flush();
    this.running = false;
    this.stopCheckpointTimer();
    this.emitPointsUpdated();
    this.disposeCallbacks?.();
    this.disposeCallbacks = null;
  }
}
