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
    // Если анимация ещё не запущена, запускаем
    if (!this.isRunning) {
      this.start();
    }
    return () => this.removeCallback(cb);
  }

  /** Удалить колбэк напрямую (альтернатива вызову функции-отписки) */
  public removeCallback(cb: AnimationCallback): void {
    this.callbacks.delete(cb);
    if (this.callbacks.size === 0) {
      this.stop();
    }
  }

  private start(): void {
    if (this.isRunning) return;
    if (this.callbacks.size === 0) {
      // Если нет колбэков, запускаем вхолостую? Можно просто ждать.
      // Но лучше запустить и проверять на каждом кадре.
    }
    this.isRunning = true;
    this.step();
  }

  public step() {
    if (!this.isRunning) return;
    // Выполняем все зарегистрированные колбэки
    for (const cb of this.callbacks) {
      cb();
    }
    if (this.AfterStep) this.AfterStep();
    this.rafId = requestAnimationFrame(() => this.step());
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
  }

  public clear(): void {
    this.callbacks.clear();
    this.stop();
  }
}
