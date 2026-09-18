import { AppMediator } from "../AppMediator";
import { PointGraphManager } from "../collections/PointGraphManager";

/**
 * Базовый класс алгоритма, который выполняется как периодическая работа
 * AnimationEngine.
 */
export abstract class BaseAlgorithm {
  public temperature = 0;
  private running = false;

  protected constructor(
    protected readonly mediator: AppMediator,
    protected readonly pointGraphManager: PointGraphManager,
    protected readonly stopTemperature: number,
  ) {}

  /** Запустить алгоритм. */
  public start(): void {
    this.running = true;
  }

  /** Остановить алгоритм. */
  public stop(): void {
    this.running = false;
  }

  /** Возвращает признак активного выполнения алгоритма. */
  public get isRunning(): boolean {
    return this.running;
  }

  /**
   * Выполнить один шаг алгоритма.
   * @returns true, если алгоритм должен продолжить работу.
   */
  public step(deltaTime: number): boolean {
    if (!this.running) return false;

    this.temperature = this.applyStep(deltaTime);
    this.mediator.temperature = this.temperature;

    if (this.temperature < this.stopTemperature) this.stop();
    return this.running;
  }

  /** Выполнить один вычислительный шаг алгоритма. */
  protected abstract applyStep(deltaTime: number): number;
}
