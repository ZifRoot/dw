export type AnimationCallback = () => void;

// core/Engines/AnimationEngine.ts
export class AnimationEngine {
  private rafId: number | null = null;
  private callbacks: Set<AnimationCallback> = new Set();
  private isRunning = false;
  public AfterStep: AnimationCallback | null = null;
  public onStop: AnimationCallback | null = null;

  /** Добавить колбэк в очередь. Возвращает функцию для удаления. */
  public addCallback(cb: AnimationCallback): AnimationCallback {
    this.callbacks.add(cb);
    if (!this.isRunning) {
      this.start();
    }
    return () => this.removeCallback(cb);
  }

  /** Удалить колбэк напрямую (альтернатива вызову функции-отписки). */
  public removeCallback(cb: AnimationCallback): void {
    this.callbacks.delete(cb);
    if (this.callbacks.size === 0) {
      this.stop();
    }
  }

  private start(): void {
    if (this.isRunning) return;
    if (this.callbacks.size === 0) return;

    this.isRunning = true;
    this.scheduleStep();
  }

  private scheduleStep(): void {
    this.rafId = requestAnimationFrame(() => this.step());
  }

  public step(): void {
    if (!this.isRunning) return;

    this.rafId = null;

    // Выполняем все зарегистрированные колбэки.
    for (const cb of this.callbacks) {
      cb();
    }

    if (this.AfterStep) this.AfterStep();

    if (this.isRunning && this.callbacks.size > 0) {
      this.scheduleStep();
    }
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const wasRunning = this.isRunning;
    this.isRunning = false;

    if (wasRunning && this.onStop) {
      this.onStop();
    }
  }

  public clear(): void {
    this.callbacks.clear();
    this.stop();
  }
}
