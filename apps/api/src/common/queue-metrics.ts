/**
 * BullMQ queue depth/age sampling — the instrumentation half of the "queue stalled" alert
 * (docs/OBSERVABILITY.md "Not yet alertable" gap, closed 2026-08-02). Both background queues
 * (offer-expiry, rating-autoclose) hand a sampler built from this helper to
 * MetricsService.registerQueueDepthObserver, which observes it into two gauges on each metric
 * export: `queue_jobs{queue,state}` (depth) and `queue_oldest_overdue_ms{queue}` (age).
 *
 * "Overdue" is measured against each job's SCHEDULED fire time (`timestamp + delay`), not its
 * enqueue time — the expiry jobs are delayed ~90s BY DESIGN, so enqueue age would read ~90s on a
 * perfectly healthy queue and trip any useful threshold. A healthy queue therefore reads ~0 here;
 * a growing value means the workers stopped promoting/processing jobs (Redis wedged, worker died)
 * and the DB reconcilers are the only thing still advancing orders.
 *
 * Dependency-free by design (mirrors micro-cache): the queue is consumed through the structural
 * `SampleableQueue` slice of BullMQ's Queue, so specs stub it with plain objects and the helper
 * never imports bullmq.
 */

/** The states worth watching per queue — a CLOSED vocabulary (the `state` label). `completed` is
 *  deliberately absent: jobs are removed on completion (`removeOnComplete: true`), so it is always
 *  ~0 and would only add series. */
export const QUEUE_JOB_STATES = ["waiting", "active", "delayed", "failed", "paused"] as const;
export type QueueJobState = (typeof QUEUE_JOB_STATES)[number];

/** One depth/age snapshot of a queue, observed into the gauges by MetricsService. */
export type QueueDepthSample = Record<QueueJobState, number> & {
  /** ms the most-overdue waiting/delayed job has been runnable past its scheduled fire time (0 = healthy). */
  oldestOverdueMs: number;
};

/** The slice of a BullMQ Queue this helper reads (structural, so specs stub it without bullmq). */
export interface SampleableQueue {
  getJobCounts(...states: string[]): Promise<Record<string, number>>;
  getWaiting(start: number, end: number): Promise<Array<{ timestamp: number; delay?: number } | undefined>>;
  getDelayed(start: number, end: number): Promise<Array<{ timestamp: number; delay?: number } | undefined>>;
}

/** How many jobs per state to inspect for the overdue computation. The oldest jobs sit at the head
 *  of each list, so a small page is enough to find the max — depth beyond it is the `queue_jobs`
 *  gauge's job, not this one's. */
const OVERDUE_SCAN_LIMIT = 10;

/**
 * Take one depth/age snapshot. Any Redis error propagates to the caller (MetricsService skips the
 * observation for that cycle — an absent point is honest where a fabricated 0 would read "healthy").
 */
export async function sampleQueueDepth(queue: SampleableQueue, now: number = Date.now()): Promise<QueueDepthSample> {
  const counts = await queue.getJobCounts(...QUEUE_JOB_STATES);
  const [waiting, delayed] = await Promise.all([
    queue.getWaiting(0, OVERDUE_SCAN_LIMIT - 1),
    queue.getDelayed(0, OVERDUE_SCAN_LIMIT - 1),
  ]);

  let oldestOverdueMs = 0;
  for (const job of [...waiting, ...delayed]) {
    if (!job) continue;
    // A delayed job's fire time is enqueue + delay; a plain waiting job's is its enqueue time.
    const dueAt = job.timestamp + (job.delay ?? 0);
    oldestOverdueMs = Math.max(oldestOverdueMs, now - dueAt);
  }

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    paused: counts.paused ?? 0,
    oldestOverdueMs,
  };
}
