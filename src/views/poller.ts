// Polling scheduler. No vscode imports so it can be unit-tested with fake timers.

export interface PollerOptions {
  /** Seconds between polls; 0 (or less) disables polling. Read on every cycle. */
  intervalSeconds: () => number;
  /** One poll. Errors are swallowed by the poller (the tick reports them itself). */
  tick: () => Promise<void>;
  /** False while nothing worth polling is visible: the poller waits instead of polling. */
  isActive?: () => boolean;
  /** Lower bound so a typo can't hammer the API. */
  minSeconds?: number;
  /** Longest backoff multiplier after rate limits. */
  maxBackoff?: number;
}

export class Poller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = 1;
  private running = false;
  private stopped = true;

  constructor(private readonly opts: PollerOptions) {}

  /** (Re)starts with the current interval. Safe to call after a configuration change. */
  start(): void {
    this.stopped = false;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Called when GitHub rate-limits us: the next polls are spaced out (x2, up to maxBackoff). */
  notifyRateLimited(): void {
    this.backoff = Math.min(this.backoff * 2, this.opts.maxBackoff ?? 8);
  }

  get currentDelayMs(): number | undefined {
    const seconds = this.opts.intervalSeconds();
    if (!(seconds > 0)) return undefined;
    return Math.max(seconds, this.opts.minSeconds ?? 30) * 1000 * this.backoff;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const delay = this.currentDelayMs;
    if (this.stopped || delay === undefined) return;
    this.timer = setTimeout(() => void this.run(), delay);
  }

  private async run(): Promise<void> {
    if (this.stopped) return;
    if (this.running || (this.opts.isActive && !this.opts.isActive())) {
      this.schedule();
      return;
    }
    this.running = true;
    const backoffBefore = this.backoff;
    try {
      await this.opts.tick();
    } catch {
      // the tick reports its own errors
    } finally {
      this.running = false;
      // A cycle without new rate limits relaxes the backoff again.
      if (this.backoff === backoffBefore && this.backoff > 1) this.backoff = Math.max(1, this.backoff / 2);
      this.schedule();
    }
  }
}
