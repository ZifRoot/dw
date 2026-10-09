import { delay } from "./data-utils";

/** Event aggregation strategies supported by EventThrottler. */
export type EventThrottlerMode = "last" | "average" | "all" | "package";

type EventHandler<T> = (value: T) => void | Promise<void>;
type PackageHandler<T> = (values: T[]) => void | Promise<void>;
type AverageHandler = (value: number) => void | Promise<void>;

interface EventOptionsBase {
  /** Collection window in milliseconds. Defaults to minMs. */
  delayMs?: number;
  minMs?: number;
  maxMs?: number;
  onError?: (error: unknown) => void;
}

export type EventThrottlerOptions<T> = EventOptionsBase & (
  | { mode: "last"; onEmit: EventHandler<T> }
  | { mode: "average"; onEmit: AverageHandler }
  | { mode: "all"; onEmit: EventHandler<T> }
  | { mode: "package"; onEmit: PackageHandler<T> }
);

/**
 * Combines serialized rate-limited execution with optional event aggregation.
 *
 * Construct with (minMs, maxMs?) to use throttle() directly, or with an
 * options object to enable push()/flush()/dispose() event processing.
 *
 * The delay between direct operations is measured from completion of the
 * previous operation to the start of the next. Event collection begins on the
 * first push and its timer is not reset by subsequent pushes. Operations never
 * overlap, including async callbacks.
 */
export class EventThrottler<T = unknown> {
  private lastCompletion = 0;
  private nextPromise: Promise<void> | null = null;
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly eventOptions?: EventThrottlerOptions<T>;
  private pendingValues: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing: Promise<void> | null = null;
  private lastPublished: T | number | undefined;
  private disposed = false;

  public constructor(minMs: number, maxMs?: number);
  public constructor(options: EventThrottlerOptions<T>);
  public constructor(
    minOrOptions: number | EventThrottlerOptions<T>,
    maxMs?: number,
  ) {
    if (typeof minOrOptions === "number") {
      const actualMin = Math.min(minOrOptions, maxMs ?? minOrOptions);
      const actualMax = Math.max(minOrOptions, maxMs ?? minOrOptions);
      this.validateInterval(actualMin, actualMax);
      this.minMs = actualMin;
      this.maxMs = actualMax;
      return;
    }

    this.eventOptions = minOrOptions;
    const min = minOrOptions.minMs ?? minOrOptions.delayMs ?? 1;
    const max = minOrOptions.maxMs ?? min;
    const actualMin = Math.min(min, max);
    const actualMax = Math.max(min, max);
    this.validateInterval(actualMin, actualMax);
    this.minMs = actualMin;
    this.maxMs = actualMax;
    if (minOrOptions.delayMs !== undefined &&
        (!Number.isFinite(minOrOptions.delayMs) || minOrOptions.delayMs <= 0)) {
      throw new RangeError("delayMs must be a finite number greater than 0");
    }
  }

  /** Run a function at the configured rate, serializing all calls. */
  public async throttle<R = void>(fn?: () => R | Promise<R>): Promise<R> {
    const release = await this.prepareNext();
    await this.applyDelay();
    try {
      return await fn?.() as R;
    } finally {
      this.lastCompletion = Date.now();
      release();
    }
  }

  /** Add an event to the active collection window. Requires event options. */
  public push(value: T): void {
    if (!this.eventOptions) {
      throw new Error("push() requires EventThrottler event options");
    }
    if (this.disposed) throw new Error("Cannot push after dispose()");
    this.pendingValues.push(value);
    if (this.timer !== null || this.processing !== null) return;
    this.schedule();
  }

  /** Process all pending events immediately and await async callbacks. */
  public async flush(): Promise<void> {
    if (!this.eventOptions) {
      throw new Error("flush() requires EventThrottler event options");
    }
    this.clearTimer();
    while (this.pendingValues.length > 0 || this.processing !== null) {
      if (this.processing !== null) {
        await this.processing;
        continue;
      }
      await this.processPending();
    }
  }

  /** Cancel scheduled work and discard pending events; active work is not cancelled. */
  public dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.pendingValues = [];
  }

  private validateInterval(min: number, max: number): void {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
      throw new RangeError("Interval must be finite and greater than 0");
    }
  }

  private async prepareNext(): Promise<() => void> {
    const previous = this.nextPromise;
    let release: () => void = () => undefined;
    this.nextPromise = new Promise<void>((resolve) => { release = resolve; });
    if (previous) await previous;
    return release;
  }

  private async applyDelay(): Promise<void> {
    const interval = this.minMs === this.maxMs
      ? this.minMs
      : this.minMs + Math.random() * (this.maxMs - this.minMs);
    await delay(Math.max(0, this.lastCompletion + interval - Date.now()));
  }

  private schedule(): void {
    const delayMs = this.eventOptions?.delayMs ?? this.minMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.processPending().catch(() => undefined);
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async processPending(): Promise<void> {
    if (this.processing !== null) {
      await this.processing;
      return;
    }
    if (this.pendingValues.length === 0 || !this.eventOptions) return;

    const values = this.pendingValues;
    this.pendingValues = [];
    const mode = this.eventOptions.mode;
    let aggregate: T | number | T[];

    try {
      aggregate = mode === "last"
        ? values[values.length - 1]
        : mode === "average"
          ? this.average(values)
          : values;
    } catch (error) {
      this.pendingValues = [...values, ...this.pendingValues];
      this.eventOptions.onError?.(error);
      throw error;
    }

    if ((mode === "last" || mode === "average") && this.lastPublished === aggregate) {
      if (this.pendingValues.length > 0 && this.timer === null) this.schedule();
      return;
    }

    let processedCount = 0;
    const operation = (async () => {
      try {
        if (mode === "all") {
          for (const value of values) {
            await this.throttle(() => (this.eventOptions as Extract<EventThrottlerOptions<T>, { mode: "all" }>).onEmit(value));
            processedCount += 1;
          }
        } else if (mode === "package") {
          await this.throttle(() => (this.eventOptions as Extract<EventThrottlerOptions<T>, { mode: "package" }>).onEmit(values));
        } else if (mode === "average") {
          await this.throttle(() => (this.eventOptions as Extract<EventThrottlerOptions<T>, { mode: "average" }>).onEmit(aggregate as number));
        } else {
          await this.throttle(() => (this.eventOptions as Extract<EventThrottlerOptions<T>, { mode: "last" }>).onEmit(aggregate as T));
        }
        if (mode === "last" || mode === "average") this.lastPublished = aggregate as T | number;
      } catch (error) {
        this.pendingValues = [...values.slice(processedCount), ...this.pendingValues];
        this.eventOptions?.onError?.(error);
        throw error;
      }
    })();

    this.processing = operation;
    try {
      await operation;
    } finally {
      this.processing = null;
      if (this.pendingValues.length > 0 && this.timer === null && !this.disposed) this.schedule();
    }
  }

  private average(values: T[]): number {
    if (values.some((value) => typeof value !== "number")) {
      throw new TypeError("average mode supports only numbers");
    }
    return (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
  }
}
