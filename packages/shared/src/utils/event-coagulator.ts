import { EventThrottler, type EventThrottlerOptions } from "./event-throttler";

/** @deprecated Use EventThrottler directly. */
export type EventCoagulatorValue = number | string | boolean;

/** @deprecated Use EventThrottlerMode. "latest" maps to "last". */
export type EventCoagulatorMode = "latest" | "average";

/**
 * @deprecated Compatibility wrapper over EventThrottler.
 * Preserves the original constructor and translates legacy mode/interval values.
 */
export class EventCoagulator<T extends EventCoagulatorValue> extends EventThrottler<T> {
  public constructor(
    delayMs: number,
    mode: EventCoagulatorMode,
    onEmit: (value: T) => void | Promise<void>,
    onError?: (error: unknown) => void,
  ) {
    const options = mode === "average"
      ? {
          minMs: delayMs,
          mode: "average" as const,
          onEmit: onEmit as (value: number) => void | Promise<void>,
          onError,
        }
      : {
          minMs: delayMs,
          mode: "last" as const,
          onEmit,
          onError,
        };
    super(options as EventThrottlerOptions<T>);
  }
}
