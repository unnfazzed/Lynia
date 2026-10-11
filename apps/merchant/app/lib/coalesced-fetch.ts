import { InflightLatch } from "./inflight-latch";

// LC-C04: comfortably above api-client's own MERCHANT_FETCH_TIMEOUT_MS (10s) — a normally-timed-out
// request always clears the latch itself first via `finally`; this is only the backstop for a request
// that somehow doesn't (a hang the transport's own timeout didn't catch, or a bug).
export const INFLIGHT_STALE_MS = 25_000;

/**
 * One poller's round trips, one at a time (the queue's `useQueuePoll` rules, shared with the order ticket
 * since MJ-RL23):
 *  - LC-C04: a self-healing in-flight latch, so a poll tick never stacks a second request on a slow one;
 *  - LC-C05: only the latest generation to start a request may apply its answer (`isLatest()`), so an
 *    out-of-order response (reachable only through the latch's stale override) never clobbers fresher state;
 *  - LC-C05 / LC-D##: a call made while one is in flight is not dropped — it is folded into ONE more round
 *    right after, and its promise resolves only once that round has landed, so an awaited post-mutation
 *    refresh really shows the mutation.
 *
 * `task` does the request and applies it; it handles its own errors.
 */
export function createCoalescedFetch(task: (isLatest: () => boolean) => Promise<void>, staleMs = INFLIGHT_STALE_MS): () => Promise<void> {
  const latch = new InflightLatch(staleMs);
  let generation = 0;
  let pending = false;
  let waiters: Array<() => void> = [];

  const run = async (): Promise<void> => {
    if (!latch.tryAcquire()) {
      pending = true;
      await new Promise<void>((resolve) => waiters.push(resolve));
      return;
    }
    const mine = ++generation;
    try {
      await task(() => mine === generation);
    } finally {
      latch.release();
      if (pending) {
        pending = false;
        const folded = waiters;
        waiters = [];
        const done = () => {
          for (const resolve of folded) resolve();
        };
        void run().then(done, done);
      }
    }
  };
  return run;
}
