import { AppMediator } from "../AppMediator";
import { PointGraphManager } from "../collections/PointGraphManager";

/**
 * Базовый класс алгоритма, который выполняется как периодическая работа
 * AnimationEngine.
 */
export abstract class BaseAlgorithm {
  /** Конфигурация алгоритма, доступная Pipeline для UI-изменений. */
  public abstract readonly config: object;

  public temperature = 0;
  private running = false;

  protected constructor(
    protected readonly mediator: AppMediator,
    protected readonly pointGraphManager: PointGraphManager,
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

  /** Возвращает актуальную температуру остановки алгоритма. */
  public abstract getStopTemperature(): number;

  /**
   * Выполнить один шаг алгоритма.
   *
   * Температура вычисляется как часть этого же шага. Pipeline получает
   * результат через состояние алгоритма и использует его для scheduling.
   *
   * @returns true, если алгоритм должен продолжить работу.
   */
  public async step(deltaTime: number): Promise<boolean> {
    if (!this.running) return false;

    this.temperature = await this.applyStep(deltaTime);

    if (this.temperature < this.getStopTemperature()) this.stop();
    return this.running;
  }

  /** Выполнить один вычислительный шаг алгоритма. */
  protected abstract applyStep(deltaTime: number): number | Promise<number>;
}
