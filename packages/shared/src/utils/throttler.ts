import { delay } from "./data-utils";

/**
 * Ограничивает частоту выполнения операций (например, fetch-запросов).
 * Интервал отсчитывается от завершения предыдущей операции до начала следующей.
 * Все вызовы выстраиваются в очередь, гарантируется последовательное выполнение.
 */
export class Throttler {
  /** Время последнего завершения операции в миллисекундах (UTC) */
  private lastCompletion = 0;

  /** Promise текущего вызова для формирования очереди */
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
   * Выполняет переданную функцию с соблюдением заданного интервала.
   * @typeparam T тип результата функции
   * @param fn функция, возвращающая значение или Promise
   * @returns Promise с результатом fn
   * @throws ошибка, если fn выбросит исключение (оно пробрасывается)
   */
  async throttle<T = void>(fn?: () => T | Promise<T>): Promise<T> {
    const release = await this.prepareNext();
    await this.applyDelay();
    try {
      return await this.exec(fn);
    } finally {
      this.updateCompletion();
      release();
    }
  }

  /**
   * Ожидает завершения предыдущего вызова и создаёт promise для текущего.
   * @private
   * @returns функцию release, которую необходимо вызвать после выполнения полезной нагрузки
   */
  private async prepareNext(): Promise<() => void> {
    const prev = this.nextPromise;
    let release: () => void = null!;
    this.nextPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (prev) await prev;
    return release;
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
    return Promise.resolve(undefined as T);
  }

  /**
   * Вычисляет и применяет задержку, необходимую для соблюдения интервала.
   * @private
   */
  private async applyDelay(): Promise<void> {
    await delay(this.getDelayMs());
  }

  /**
   * Возвращает следующий интервал (фиксированный или случайный).
   * @returns задержка в миллисекундах
   */
  private getInterval(): number {
    if (this.minMs === this.maxMs) return this.minMs;
    return this.minMs + Math.random() * (this.maxMs - this.minMs);
  }

  /**
   * Вычисляет задержку, необходимую для соблюдения интервала.
   */
  private getDelayMs(): number {
    const now = Date.now();
    const desiredStart = this.lastCompletion + this.getInterval();
    const delayTime = Math.max(0, desiredStart - now);
    return delayTime;
  }

  /**
   * Обновляет время последнего завершения операции.
   * @private
   */
  private updateCompletion(): void {
    this.lastCompletion = Date.now();
  }
}
