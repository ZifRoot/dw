/** Примитивные значения, для которых сравнение выполняется через ===. */
export type EventCoagulatorValue = number | string | boolean;

/** Способ получения значения из событий, накопленных за интервал. */
export type EventCoagulatorMode = "latest" | "average";

/**
 * Коагулирует часто поступающие значения в одно событие.
 *
 * Все значения, поступившие в течение заданного интервала, не выполняются
 * по отдельности. По окончании интервала наружу передаётся одно значение:
 * последнее или среднее.
 *
 * Одинаковые результирующие значения повторно не публикуются.
 *
 * Класс предназначен для примитивных значений. Глубокое сравнение объектов
 * намеренно не выполняется.
 */
export class EventCoagulator<T extends EventCoagulatorValue> {
  private pendingValues: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: T | undefined;

  /**
   * Создаёт EventCoagulator.
   *
   * @param delayMs - минимальная задержка перед публикацией накопленного значения.
   * @param mode - способ получения результирующего значения.
   * @param onEmit - обработчик опубликованного значения.
   */
  public constructor(
    private readonly delayMs: number,
    private readonly mode: EventCoagulatorMode,
    private readonly onEmit: (value: T) => void,
  ) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      throw new RangeError("Задержка должна быть конечным числом больше 0");
    }
  }

  /**
   * Принимает новое значение.
   *
   * Если в данный момент уже идёт ожидание, значение добавляется
   * в текущее окно и отдельное событие для него не создаётся.
   */
  public push(value: T): void {
    this.pendingValues.push(value);

    if (this.timer !== null) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitPending();
    }, this.delayMs);
  }

  /**
   * Немедленно публикует накопленное значение.
   *
   * Используется, когда перед уничтожением или остановкой системы
   * необходимо обработать последнее накопленное состояние.
   */
  public flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.emitPending();
  }

  /** Останавливает ожидание и отбрасывает ещё не опубликованные значения. */
  public dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.pendingValues = [];
  }

  /** Публикует результат текущего окна, если он отличается от предыдущего. */
  private emitPending(): void {
    if (this.pendingValues.length === 0) {
      return;
    }

    const values = this.pendingValues;
    this.pendingValues = [];

    const value = this.aggregate(values);

    if (this.lastPublished === value) {
      return;
    }

    this.lastPublished = value;
    this.onEmit(value);
  }

  /** Получает результирующее значение текущего окна. */
  private aggregate(values: T[]): T {
    if (this.mode === "latest") {
      return values[values.length - 1];
    }

    if (typeof values[0] !== "number") {
      throw new TypeError("Режим average поддерживает только number");
    }

    const sum = values.reduce((total, value) => total + (value as number), 0);
    return (sum / values.length) as T;
  }
}
