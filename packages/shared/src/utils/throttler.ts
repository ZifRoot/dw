import { EventThrottler } from "./event-throttler";

/**
 * @deprecated Use EventThrottler. Kept as a compatibility alias for existing callers.
 * Preserves serialized execution, randomized intervals, and generic return values.
 */
export class Throttler extends EventThrottler<void> {
  public constructor(minMs: number, maxMs: number = minMs) {
    super(minMs, maxMs);
  }
}
