// core/BaseMediator.ts
export class BaseMediator extends EventTarget {
  private state = new Map<string, any>();

  // ========== Управление состоянием ==========
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

  // ========== События ==========
  public emit(eventName: string, detail?: any): void {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  public on(eventName: string, callback: EventListener): () => void {
    this.addEventListener(eventName, callback);
    return () => this.removeEventListener(eventName, callback);
  }

  public once(eventName: string, callback: EventListener): () => void {
    const wrapper = (e: Event) => {
      callback(e);
      this.removeEventListener(eventName, wrapper);
    };
    this.addEventListener(eventName, wrapper);
    return () => this.removeEventListener(eventName, wrapper);
  }

  public off(eventName: string, callback: EventListener): void {
    this.removeEventListener(eventName, callback);
  }
}