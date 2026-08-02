/**
 * LC-C04: a self-healing in-flight latch. `useQueuePoll`'s old plain boolean ref cleared only in a
 * `finally`, so a request that never settled (no fetch timeout existed) latched forever — the kitchen
 * board froze on its last-known list for the rest of the shift, the new-order alarm never rang, and
 * the "Connected" pill stayed green. `api-client.ts` now bounds every request with a timeout, so a
 * held latch should always self-clear within that window — this is the backstop for the case where it
 * somehow doesn't: `staleMs` should sit comfortably above the transport's own timeout.
 */
export class InflightLatch {
  private since: number | null = null;

  constructor(
    private readonly staleMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True if the caller now holds the latch — either it was free, or it was held longer than `staleMs`
   *  and got force-cleared. False means a genuinely fresh call is already in flight; skip this round. */
  tryAcquire(): boolean {
    if (this.since !== null && this.now() - this.since < this.staleMs) return false;
    this.since = this.now();
    return true;
  }

  release(): void {
    this.since = null;
  }
}
