/** Primitive values compared with strict equality. */
export type EventCoagulatorValue = number | string | boolean;

/** Aggregation applied to values collected in one window. */
export type EventCoagulatorMode = "latest" | "average";

/**
 * Coalesces frequent values into asynchronous, non-overlapping emissions.
 *
 * A processing window starts after delayMs without being reset by each push.
 * Once onEmit finishes, a new delay window starts before another emission.
 * Values pushed while onEmit is running are coalesced into the next emission.
 *
 * Only primitive values are supported; object deep equality is intentionally
 * not performed. Failed emissions are retained and can be retried by a later
 * push or flush. A failed emission is reported through onError when provided.
 */
export class EventCoagulator<T extends EventCoagulatorValue> {
  private pendingValues: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: T | undefined;
  private processing: Promise<void> | null = null;

  public constructor(
    private readonly delayMs: number,
    private readonly mode: EventCoagulatorMode,
    private readonly onEmit: (value: T) => void | Promise<void>,
    private readonly onError?: (error: unknown) => void,
  ) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      throw new RangeError("Delay must be a finite number greater than 0");
    }
  }

  /** Add a value to the current window, scheduling processing if idle. */
  public push(value: T): void {
    this.pendingValues.push(value);
    if (this.timer !== null || this.processing !== null) return;
    this.schedule();
  }

  /**
   * Immediately process pending values and wait for asynchronous completion.
   *
   * If processing fails, the values remain pending and this promise rejects.
   * A later push or flush can retry them.
   */
  public async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    while (this.pendingValues.length > 0 || this.processing !== null) {
      if (this.processing !== null) {
        await this.processing;
        continue;
      }

      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      await this.processPending();
    }
  }

  /** Cancel the timer and discard values not yet being processed. */
  public dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingValues = [];
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.processPending().catch(() => undefined);
    }, this.delayMs);
  }

  private async processPending(): Promise<void> {
    if (this.processing !== null) {
      await this.processing;
      return;
    }
    if (this.pendingValues.length === 0) return;

    const values = this.pendingValues;
    this.pendingValues = [];
    const value = this.aggregate(values);

    if (this.lastPublished === value) {
      if (this.pendingValues.length > 0 && this.timer === null) this.schedule();
      return;
    }

    let succeeded = false;
    let hasNewValuesAfterFailure = false;
    const operation = Promise.resolve().then(async () => {
      try {
        await this.onEmit(value);
        this.lastPublished = value;
        succeeded = true;
      } catch (error) {
        hasNewValuesAfterFailure = this.pendingValues.length > 0;
        this.pendingValues = [...values, ...this.pendingValues];
        this.onError?.(error);
        throw error;
      }
    });

    this.processing = operation;
    try {
      await operation;
    } finally {
      this.processing = null;
      if (
        this.pendingValues.length > 0 &&
        this.timer === null &&
        (succeeded || hasNewValuesAfterFailure)
      ) {
        this.schedule();
      }
    }
  }

  private aggregate(values: T[]): T {
    if (this.mode === "latest") return values[values.length - 1];

    if (typeof values[0] !== "number") {
      throw new TypeError("Average mode supports only numbers");
    }

    const sum = values.reduce((total, value) => total + (value as number), 0);
    return (sum / values.length) as T;
  }
}
