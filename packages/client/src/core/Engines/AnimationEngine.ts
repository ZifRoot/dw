export type AnimationCallback = () => void;

export class AnimationEngine {
  private rafId: number | null = null;
  private callback: AnimationCallback | null = null;
  private isRunning = false;

  /**
   * Установить функцию обновления.
   * Если callback === null → анимация останавливается.
   * Если callback !== null и анимация не запущена → автоматически запускается.
   */
  public setCallback(cb: AnimationCallback | null): void {
    this.callback = cb;
    if (typeof cb === "function") {
      // this.start();
    } else {
      this.stop();
    }
  }

  /** Запустить анимацию (используя текущий callback, если он есть) */
  public start(): void {
    if (this.isRunning) return;
    if (!this.callback) {
      console.warn("AnimationEngine.start: no callback set, call setCallback first");
      return;
    }
    this.isRunning = true;
    const step = () => {
      if (!this.isRunning) return;
      if (this.callback) this.callback();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** Остановить анимацию (callback сохраняется) */
  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  /** Получить текущий callback (может быть null) */
  public getCallback(): AnimationCallback | null {
    return this.callback;
  }
}
