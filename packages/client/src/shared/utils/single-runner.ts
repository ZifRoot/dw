// Утилита для ограничения выполнения функции до одного экземпляра
export class SingleExecution {
  private running = false;

  async run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }
}
