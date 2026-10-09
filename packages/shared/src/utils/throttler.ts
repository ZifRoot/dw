import { delay } from "./data-utils";

/**
 * Rate-limited sequential execution.
 *
 * Each call supplies its own callback. Calls share one completion-based
 * interval and never overlap, including when callbacks return promises.
 */
export class Throttler {
  private lastCompletion = 0;
  private nextPromise: Promise<void> | null = null;
  private readonly minMs: number;
  private readonly maxMs: number;

  public constructor(minMs: number, maxMs?: number) {
    const actualMin = Math.min(minMs, maxMs ?? minMs);
    const actualMax = Math.max(minMs, maxMs ?? minMs);
    this.validateInterval(actualMin, actualMax);
    this.minMs = actualMin;
    this.maxMs = actualMax;
  }

  /** Run a callback after the shared interval, preserving call order. */
  public async throttle<R = void>(fn?: () => R | Promise<R>): Promise<R> {
    const release = await this.prepareNext();
    try {
      await this.applyDelay();
      return await fn?.() as R;
    } finally {
      this.lastCompletion = Date.now();
      release();
    }
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
}
