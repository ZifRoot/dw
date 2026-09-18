export type AnimationCallback = (deltaTime: number) => void;

const CALIBRATION_FRAMES = 5;
const COMPUTATION_BUDGET_RATIO = 0.8;

/**
 * Планировщик фоновых работ на requestAnimationFrame.
 *
 * AnimationEngine не знает ничего о назначении зарегистрированных колбэков.
 * Он только запускает их с учётом временного бюджета кадра и распределяет
 * работу по принципу cooperative round-robin.
 *
 * Перед запуском планировщика двигатель измеряет реальный интервал между
 * кадрами и использует 80% среднего интервала как бюджет вычислений.
 */
export class AnimationEngine {
  private frameBudgetMs: number | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private isCalibrating = false;
  private nextCallbackId = 0;
  private cursor = 0;
  private lastFrameTime: number | null = null;
  private callbacks = new Map<number, AnimationCallback>();
  private order: number[] = [];

  constructor() {
    this.isCalibrating = true;
    this.calibrate();
  }

  /** Добавить один колбэк в очередь. Возвращает функцию для удаления. */
  public addCallback(callback: AnimationCallback): () => void {
    const id = this.nextCallbackId++;
    this.callbacks.set(id, callback);
    this.order.push(id);
    this.start();
    return () => this.removeCallbackById(id);
  }

  /** Добавить группу колбэков и получить один disposer для всей группы. */
  public addCallbacks(callbacks: AnimationCallback[]): () => void {
    const disposers = callbacks.map((callback) => this.addCallback(callback));
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers) dispose();
    };
  }

  /** Удалить колбэк напрямую. */
  public removeCallback(callback: AnimationCallback): void {
    const entry = this.order.find((id) => this.callbacks.get(id) === callback);
    if (entry !== undefined) this.removeCallbackById(entry);
  }

  private removeCallbackById(id: number): void {
    if (!this.callbacks.delete(id)) return;
    const index = this.order.indexOf(id);
    if (index >= 0) {
      this.order.splice(index, 1);
      if (index < this.cursor) this.cursor--;
      if (this.cursor >= this.order.length) this.cursor = 0;
    }
    if (this.callbacks.size === 0) this.stop();
  }

  private start(): void {
    if (this.isRunning || this.isCalibrating || this.callbacks.size === 0) return;
    this.isRunning = true;
    this.lastFrameTime = null;
    this.scheduleStep();
  }

  private scheduleStep(): void {
    this.rafId = requestAnimationFrame((timestamp) => this.step(timestamp));
  }

  private calibrate(): void {
    let previousTimestamp: number | null = null;
    let totalFrameTime = 0;
    let measuredFrames = 0;

    const measure = (timestamp: number): void => {
      if (previousTimestamp !== null) {
        totalFrameTime += timestamp - previousTimestamp;
        measuredFrames++;
      }

      previousTimestamp = timestamp;

      if (measuredFrames < CALIBRATION_FRAMES - 1) {
        requestAnimationFrame(measure);
        return;
      }

      this.frameBudgetMs = Math.max(1, (totalFrameTime / measuredFrames) * COMPUTATION_BUDGET_RATIO);
      this.isCalibrating = false;
      this.start();
    };

    requestAnimationFrame(measure);
  }

  /** Выполнить один кадр планировщика. */
  public step(timestamp = performance.now()): void {
    if (!this.isRunning || this.frameBudgetMs === null) return;
    this.rafId = null;
    const deltaTime = this.lastFrameTime === null ? 0 : timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    const frameStart = performance.now();
    const callbackCount = this.order.length;
    let executed = 0;

    while (this.callbacks.size > 0 && executed < callbackCount && (executed === 0 || performance.now() - frameStart < this.frameBudgetMs)) {
      if (this.order.length === 0) break;
      if (this.cursor >= this.order.length) this.cursor = 0;
      const id = this.order[this.cursor];
      this.cursor = (this.cursor + 1) % this.order.length;
      const callback = this.callbacks.get(id);
      if (!callback) continue;
      callback(deltaTime);
      executed++;
    }

    if (this.isRunning && this.callbacks.size > 0) this.scheduleStep();
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
    this.lastFrameTime = null;
  }

  public clear(): void {
    this.callbacks.clear();
    this.order.length = 0;
    this.cursor = 0;
    this.stop();
  }
}
