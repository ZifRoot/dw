/**
 * Ограничивает частоту выполнения операций (например, fetch-запросов) в Node.js / браузере.
 * Интервал отсчитывается от завершения предыдущей операции до начала следующей.
 * Гарантирует последовательное выполнение за счёт очереди на Promise.
 */
export class Throttler {
  private lastCompletion = 0;
  private nextPromise: Promise<void> | null = null;

  /**
   * Создаёт экземпляр Throttler.
   * @param minMs - минимальная задержка в миллисекундах (при фиксированном интервале совпадает с maxMs)
   * @param maxMs - максимальная задержка в миллисекундах (если не указана, интервал фиксированный)
   */
  constructor(
    private minMs: number,
    private maxMs: number = minMs,
  ) {
    // Приводим значения к корректному диапазону (min <= max)
    const actualMin = Math.min(minMs, maxMs);
    const actualMax = Math.max(minMs, maxMs);
    if (actualMin <= 0) throw new RangeError("Интервал должен быть >0");
    this.minMs = actualMin;
    this.maxMs = actualMax;
  }

  /**
   * Выполняет функцию с учётом интервала (или просто делает задержку, если fn не передана).
   * @param fn - опциональная функция, возвращающая значение или Promise
   * @returns результат fn, обёрнутый в Promise. Если fn не указана, возвращает Promise<void>.
   */
  async throttle<T = void>(fn?: () => T | Promise<T>): Promise<T> {
    const release = await this.prepareNext();
    try {
      const delay = this.getDelayMs();
      await this.sleep(delay);
      return this.exec(fn);
    } finally {
      this.lastCompletion = Date.now();
      release();
    }
  }

  /**
   * Подготавливает следующий вызов: дожидается завершения предыдущего и создаёт новый promise.
   * @returns функцию, которую необходимо вызвать после выполнения полезной нагрузки для освобождения очереди.
   */
  private async prepareNext(): Promise<() => void> {
    const prev = this.nextPromise;
    let release: () => void;
    this.nextPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (prev) await prev;
    return () => {
      release();
      this.nextPromise = null;
    };
  }

  /**
   * Ожидает завершения текущего promise (если он существует).
   */
  private async waitNext(): Promise<void> {
    const prev = this.nextPromise;
    if (prev) await prev;
  }

  /**
   * Создаёт promise для следующего вызова и возвращает функцию его разрешения.
   * @returns функцию, которая разрешает promise и обнуляет ссылку на него.
   */
  private enqueueNext(): () => void {
    let release: () => void;
    this.nextPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      release();
      this.nextPromise = null;
    };
  }

  /**
   * Выполняет переданную функцию (синхронную или асинхронную).
   * @param fn - функция (опционально)
   * @returns результат выполнения fn или undefined, если fn не передана.
   */
  private async exec<T>(fn?: () => T | Promise<T>): Promise<T> {
    if (fn instanceof Function) {
      return await fn();
    }
    return undefined as T;
  }

  /**
   * Асинхронная задержка.
   * @param delay - время в миллисекундах (если <= 0, задержка пропускается)
   */
  private async sleep(delay: number): Promise<void> {
    if (delay <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Возвращает следующий интервал: фиксированный или случайный (равномерное распределение).
   */
  private getInterval(): number {
    if (this.minMs === this.maxMs) return this.minMs;
    return this.minMs + Math.random() * (this.maxMs - this.minMs);
  }

  /**
   * Вычисляет, сколько миллисекунд нужно ждать до разрешённого старта.
   * @returns задержка в миллисекундах (0 – не ждать)
   */
  private getDelayMs(): number {
    const desiredStart = this.lastCompletion + this.getInterval();
    return Math.max(0, desiredStart - Date.now());
  }
}
