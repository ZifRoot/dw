import { AppMediator } from "../AppMediator";

/**
 * Базовый класс алгоритма, который выполняется как периодическая работа
 * AnimationEngine.
 */
export abstract class BaseAlgorithm {
  /** Конфигурация алгоритма, доступная Pipeline для UI-изменений. */
  public abstract readonly config: object;

  public temperature = 0;
  private running = false;

  protected constructor(protected readonly mediator: AppMediator) {}

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
   * Выполнить один синхронный шаг алгоритма.
   *
   * @returns true, если алгоритм должен продолжить работу.
   */
  public step(deltaTime: number): boolean {
    if (!this.running) return false;

    this.temperature = this.applyStep(deltaTime);

    if (this.temperature < this.getStopTemperature()) this.stop();
    return this.running;
  }

  /**
   * Выполнить один шаг алгоритма и дождаться его завершения.
   *
   * Синхронные algorithms используют тот же код через Promise.resolve().
   * Backend algorithms с асинхронным исполнением могут переопределить
   * applyStepAsync() без изменения общего Pipeline API.
   */
  public async stepAsync(deltaTime: number): Promise<boolean> {
    if (!this.running) return false;

    this.temperature = await this.applyStepAsync(deltaTime);

    if (this.temperature < this.getStopTemperature()) this.stop();
    return this.running;
  }

  /** Выполнить один вычислительный шаг алгоритма. */
  protected abstract applyStep(deltaTime: number): number;

  /** Выполнить один вычислительный шаг, допускающий async backend. */
  protected async applyStepAsync(deltaTime: number): Promise<number> {
    return this.applyStep(deltaTime);
  }
}
