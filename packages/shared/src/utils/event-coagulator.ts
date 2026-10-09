import { EventThrottler, type EventThrottlerOptions } from "./event-throttler";

/** @deprecated Use EventThrottler with mode "last", "average", "all", or "package". */
export type EventCoagulatorValue = number | string | boolean;

/** @deprecated Use EventThrottlerMode. "latest" maps to "last". */
export type EventCoagulatorMode = "latest" | "average";

/**
 * @deprecated Compatibility wrapper. Prefer EventThrottler directly.
 * Keeps the existing EventCoagulator constructor while using the unified implementation.
 */
export class EventCoagulator<T extends EventCoagulatorValue> {
  private readonly throttler: EventThrottler<T>;

  public constructor(
    delayMs: number,
    mode: EventCoagulatorMode,
    onEmit: (value: T) => void | Promise<void>,
    onError?: (error: unknown) => void,
  ) {
    const options = mode === "average"
      ? { delayMs, mode: "average" as const, onEmit: onEmit as (value: number) => void | Promise<void>, onError }
      : { delayMs, mode: "last" as const, onEmit, onError };
    this.throttler = new EventThrottler<T>(options as EventThrottlerOptions<T>);
  }

  public push(value: T): void {
    this.throttler.push(value);
  }

  public flush(): Promise<void> {
    return this.throttler.flush();
  }

  public dispose(): void {
    this.throttler.dispose();
  }
}
