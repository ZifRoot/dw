/// <summary>Медиатор на основе EventTarget для связи CanvasEngine и UI.</summary>
export class AppMediator extends EventTarget {
  private state = new Map<string, any>();

  constructor() {
    super();
  }

  /// <summary>Устанавливает значение и генерирует событие.</summary>
  public set(key: string, value: any): void {
    const old = this.state.get(key);
    if (old === value) return;
    this.state.set(key, value);
    this.dispatchEvent(new CustomEvent(key, { detail: value }));
  }

  /// <summary>Возвращает текущее значение.</summary>
  public get(key: string): any {
    return this.state.get(key);
  }

  /// <summary>Удобные геттеры/сеттеры для конкретных полей.</summary>
  public get temperature(): number {
    return this.get('temperature') ?? 0;
  }
  public set temperature(value: number) {
    this.set('temperature', value);
  }

  public get autoZoom(): boolean {
    return this.get('autoZoom') ?? true;
  }
  public set autoZoom(value: boolean) {
    this.set('autoZoom', value);
  }

  // ========== Команды (вызываются из UI) ==========
  public clearPoints(): void {
    this.dispatchEvent(new Event('clear-points'));
  }

  public startRepulsion(): void {
    this.dispatchEvent(new Event('start-repulsion'));
  }

  public setAutoZoom(enabled: boolean): void {
    this.autoZoom = enabled;
    this.dispatchEvent(new CustomEvent('set-auto-zoom', { detail: enabled }));
  }
}