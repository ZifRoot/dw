import { Throttler } from "./throttler";

/** Event aggregation strategies supported by EventThrottler. */
export type EventThrottlerMode = "last" | "average" | "all" | "package";

type EventHandler<T> = (value: T) => void | Promise<void>;
type PackageHandler<T> = (values: T[]) => void | Promise<void>;
type AverageHandler = (value: number) => void | Promise<void>;

interface EventOptionsBase {
  minMs: number;
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
 * Extends Throttler with event buffering and aggregation.
 *
 * Event callbacks and callbacks passed directly to throttle() use the same
 * inherited queue and interval. Event collection starts on the first push;
 * later pushes do not reset the collection window.
 */
export class EventThrottler<T = unknown> extends Throttler {
  private readonly eventOptions: EventThrottlerOptions<T>;
  private pendingValues: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing: Promise<void> | null = null;
  private lastPublished: T | number | undefined;
  private disposed = false;

  public constructor(options: EventThrottlerOptions<T>) {
    super(options.minMs, options.maxMs);
    this.eventOptions = options;
  }

  /** Add an event to the active collection window. */
  public push(value: T): void {
    if (this.disposed) throw new Error("Cannot push after dispose()");
    this.pendingValues.push(value);
    if (this.timer !== null || this.processing !== null) return;
    this.schedule();
  }

  /** Process pending events immediately and await asynchronous callbacks. */
  public async flush(): Promise<void> {
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

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.processPending().catch(() => undefined);
    }, this.eventOptions.minMs);
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
    if (this.pendingValues.length === 0) return;

    const values = this.pendingValues;
    this.pendingValues = [];
    const { mode, onEmit, onError } = this.eventOptions;
    let aggregate: T | number | T[];

    try {
      aggregate = mode === "last"
        ? values[values.length - 1]
        : mode === "average"
          ? this.average(values)
          : values;
    } catch (error) {
      this.pendingValues = [...values, ...this.pendingValues];
      onError?.(error);
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
          const handler = onEmit as EventHandler<T>;
          for (const value of values) {
            await this.throttle(() => handler(value));
            processedCount += 1;
          }
        } else if (mode === "package") {
          await this.throttle(() => (onEmit as PackageHandler<T>)(values));
        } else if (mode === "average") {
          await this.throttle(() => (onEmit as AverageHandler)(aggregate as number));
        } else {
          await this.throttle(() => (onEmit as EventHandler<T>)(aggregate as T));
        }
        if (mode === "last" || mode === "average") this.lastPublished = aggregate as T | number;
      } catch (error) {
        this.pendingValues = [...values.slice(processedCount), ...this.pendingValues];
        onError?.(error);
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
