import { describe, expect, it } from "vitest";
import { QUEUE_JOB_STATES, type SampleableQueue, sampleQueueDepth } from "./queue-metrics";

/** A stubbed BullMQ queue slice — counts and job pages are plain data, no Redis. */
function stubQueue(opts: {
  counts?: Record<string, number>;
  waiting?: Array<{ timestamp: number; delay?: number } | undefined>;
  delayed?: Array<{ timestamp: number; delay?: number } | undefined>;
}): SampleableQueue {
  return {
    getJobCounts: async () => opts.counts ?? {},
    getWaiting: async () => opts.waiting ?? [],
    getDelayed: async () => opts.delayed ?? [],
  };
}

const NOW = 1_000_000;

describe("sampleQueueDepth", () => {
  it("maps every watched state's count and defaults a missing state to 0", async () => {
    const sample = await sampleQueueDepth(
      stubQueue({ counts: { waiting: 3, active: 1, delayed: 7 } }), // failed/paused absent
      NOW,
    );
    expect(sample.waiting).toBe(3);
    expect(sample.active).toBe(1);
    expect(sample.delayed).toBe(7);
    expect(sample.failed).toBe(0);
    expect(sample.paused).toBe(0);
    // The closed state vocabulary is exactly what the sample carries (plus the overdue age).
    expect(Object.keys(sample).sort()).toEqual([...QUEUE_JOB_STATES, "oldestOverdueMs"].sort());
  });

  it("reads 0 overdue for a HEALTHY queue: a delayed job whose fire time is still in the future", async () => {
    // The expiry queue's normal state — a job enqueued now with the ~90s auction delay. Enqueue age
    // alone would read 30s here; overdue-vs-scheduled-time must read 0.
    const sample = await sampleQueueDepth(
      stubQueue({ delayed: [{ timestamp: NOW - 30_000, delay: 90_000 }] }),
      NOW,
    );
    expect(sample.oldestOverdueMs).toBe(0);
  });

  it("measures overdue against the SCHEDULED fire time (enqueue + delay), taking the max across jobs", async () => {
    const sample = await sampleQueueDepth(
      stubQueue({
        // Waiting job with no delay: runnable since enqueue, 45s ago.
        waiting: [{ timestamp: NOW - 45_000 }],
        // Delayed job that should have fired 120s ago (enqueued 210s ago with a 90s delay) — the max.
        delayed: [{ timestamp: NOW - 210_000, delay: 90_000 }],
      }),
      NOW,
    );
    expect(sample.oldestOverdueMs).toBe(120_000);
  });

  it("skips undefined page entries instead of throwing", async () => {
    const sample = await sampleQueueDepth(
      stubQueue({ waiting: [undefined, { timestamp: NOW - 10_000 }] }),
      NOW,
    );
    expect(sample.oldestOverdueMs).toBe(10_000);
  });

  it("propagates a Redis error to the caller (MetricsService skips the cycle — never a fabricated 0)", async () => {
    const broken: SampleableQueue = {
      getJobCounts: async () => {
        throw new Error("redis down");
      },
      getWaiting: async () => [],
      getDelayed: async () => [],
    };
    await expect(sampleQueueDepth(broken, NOW)).rejects.toThrow("redis down");
  });
});
