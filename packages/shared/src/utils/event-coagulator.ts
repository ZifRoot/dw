import { EventThrottler, type EventThrottlerOptions } from "./event-throttler";

/** @deprecated Primitive values supported by the legacy EventCoagulator API. */
export type EventCoagulatorValue = number | string | boolean;

/** @deprecated Use EventThrottlerMode. "latest" maps to "last". */
export type EventCoagulatorMode = "latest" | "average";

/**
 * @deprecated Compatibility wrapper over EventThrottler.
 * Preserves the legacy constructor and translates its mode to the new API.
 */
export class EventCoagulator<T extends EventCoagulatorValue> extends EventThrottler<T> {
  public constructor(
    delayMs: number,
    mode: EventCoagulatorMode,
    onEmit: (value: T) => void,
  ) {
    const options = mode === "average"
      ? {
          minMs: delayMs,
          mode: "average" as const,
          onEmit: onEmit as (value: number) => void,
        }
      : {
          minMs: delayMs,
          mode: "last" as const,
          onEmit,
        };
    super(options as EventThrottlerOptions<T>);
  }
}
