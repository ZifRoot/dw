// core/BaseMediator.ts
export class BaseMediator extends EventTarget {
  private state = new Map<string, any>();

  public set(key: string, value: any): void {
    const old = this.state.get(key);
    if (old === value) return;
    this.state.set(key, value);
    this.emit(key, value);
  }

  public get(key: string): any {
    return this.state.get(key);
  }

  public has(key: string): boolean {
    return this.state.has(key);
  }

  /**
   * Генерирует событие с данными detail.
   * Внешний код не должен вызывать этот метод напрямую (только наследники).
   */
  protected emit(eventName: string, detail?: any): void {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Подписка на событие. Колбэк получает уже извлечённое значение detail.
   * Возвращает функцию отписки.
   */
  public on(eventName: string, callback: (detail: any) => void): () => void {
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent;
      callback(customEvent.detail);
    };
    this.addEventListener(eventName, listener);
    return () => this.removeEventListener(eventName, listener);
  }

  /** Одноразовая подписка */
  public once(eventName: string, callback: (detail: any) => void): () => void {
    const wrapper = (e: Event) => {
      const customEvent = e as CustomEvent;
      callback(customEvent.detail);
      this.removeEventListener(eventName, wrapper);
    };
    this.addEventListener(eventName, wrapper);
    return () => this.removeEventListener(eventName, wrapper);
  }

  public off(eventName: string, callback: EventListener): void {
    this.removeEventListener(eventName, callback);
  }
}
