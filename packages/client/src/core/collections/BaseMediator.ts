// core/BaseMediator.ts
type EventPayloadArgs<TPayload> = [TPayload] extends [undefined]
  ? []
  : [payload: TPayload];

export class BaseMediator<TEventMap extends Record<string, unknown>> extends EventTarget {
  private state = new Map<keyof TEventMap, TEventMap[keyof TEventMap]>();

  public set<K extends keyof TEventMap>(key: K, value: TEventMap[K]): void {
    const old = this.state.get(key);
    if (old === value) return;
    this.state.set(key, value);
    this.emit(key, value);
  }

  public get<K extends keyof TEventMap>(key: K): TEventMap[K] | undefined {
    return this.state.get(key) as TEventMap[K] | undefined;
  }

  public has<K extends keyof TEventMap>(key: K): boolean {
    return this.state.has(key);
  }

  /**
   * Генерирует событие с данными detail.
   * Внешний код не должен вызывать этот метод напрямую (только наследники).
   */
  protected emit<K extends keyof TEventMap>(
    eventName: K,
    ...args: EventPayloadArgs<TEventMap[K]>
  ): void {
    const detail = args.length === 0 ? undefined : args[0];
    this.dispatchEvent(new CustomEvent(String(eventName), { detail }));
  }

  /**
   * Подписка на событие. Колбэк получает уже извлечённое значение detail.
   * Возвращает функцию отписки.
   */
  public on<K extends keyof TEventMap>(
    eventName: K,
    callback: (detail: TEventMap[K]) => void,
  ): () => void {
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent<TEventMap[K]>;
      callback(customEvent.detail);
    };
    this.addEventListener(String(eventName), listener);
    return () => this.removeEventListener(String(eventName), listener);
  }

  /** Одноразовая подписка */
  public once<K extends keyof TEventMap>(
    eventName: K,
    callback: (detail: TEventMap[K]) => void,
  ): () => void {
    const wrapper = (e: Event) => {
      const customEvent = e as CustomEvent<TEventMap[K]>;
      callback(customEvent.detail);
      this.removeEventListener(String(eventName), wrapper);
    };
    this.addEventListener(String(eventName), wrapper);
    return () => this.removeEventListener(String(eventName), wrapper);
  }

  public off<K extends keyof TEventMap>(
    eventName: K,
    callback: EventListener,
  ): void {
    this.removeEventListener(String(eventName), callback);
  }
}
