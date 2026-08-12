type Listener = (state: string) => void;
let mockAppStateListener: Listener | null = null;
const mockAppStateRemove = jest.fn();
const mockAddEventListener = jest.fn((_: string, cb: Listener) => {
  mockAppStateListener = cb;
  return { remove: mockAppStateRemove };
});

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (...args: [string, Listener]) => mockAddEventListener(...args),
  },
}));

const mockApiFetch = jest.fn().mockResolvedValue(undefined);
jest.mock("../../api/client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { bootElapsedMs, buildBatches, clampGlassSample, enqueue, enqueueApiFetch, enqueueBoot, flush, start, stop, type RoleSample } from "../rum";

describe("clampGlassSample (pure)", () => {
  it("returns the elapsed ms for a sane server timestamp", () => {
    expect(clampGlassSample(1_000_100, new Date(1_000_000).toISOString())).toBe(100);
  });

  it("drops a negative skew (server clock ahead of device)", () => {
    expect(clampGlassSample(1_000_000, new Date(1_000_100).toISOString())).toBeNull();
  });

  it("drops a sample beyond the cap", () => {
    expect(clampGlassSample(70_000, new Date(0).toISOString(), 60_000)).toBeNull();
  });

  it("drops an unparseable timestamp", () => {
    expect(clampGlassSample(1_000, "not-a-date")).toBeNull();
  });
});

describe("buildBatches (pure)", () => {
  it("groups by role and attributes dropped once to the first batch", () => {
    const samples: RoleSample[] = [
      { role: "customer", event: "apifetch", ms: 10 },
      { role: "rider", event: "board_glass", ms: 20 },
      { role: "customer", event: "apifetch", ms: 30 },
    ];
    const batches = buildBatches(samples, 3, "1.2");
    expect(batches).toHaveLength(2);
    const customerBatch = batches.find((b) => b.role === "customer");
    const riderBatch = batches.find((b) => b.role === "rider");
    expect(customerBatch?.samples).toEqual([
      { event: "apifetch", ms: 10 },
      { event: "apifetch", ms: 30 },
    ]);
    expect(customerBatch?.appVersion).toBe("1.2");
    expect((customerBatch?.dropped ?? 0) + (riderBatch?.dropped ?? 0)).toBe(3);
  });

  it("chunks a role's samples into ≤20-sample batches", () => {
    const samples: RoleSample[] = Array.from({ length: 25 }, (_, i) => ({
      role: "customer" as const,
      event: "apifetch" as const,
      ms: i,
    }));
    const batches = buildBatches(samples, 0);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.samples).toHaveLength(20);
    expect(batches[1]?.samples).toHaveLength(5);
  });
});

describe("enqueueApiFetch sampling (A-O6: 1-in-4, deterministic)", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  afterEach(() => {
    stop();
  });

  it("keeps only every 4th apifetch sample", async () => {
    start("8.4");
    // 8 calls -> counter hits 4 and 8 -> exactly 2 kept, in order.
    for (let ms = 1; ms <= 8; ms++) enqueueApiFetch(ms);
    await flush();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockApiFetch.mock.calls[0] as [string, { body: { samples: unknown[] } }];
    expect(options.body.samples).toEqual([
      { event: "apifetch", ms: 4 },
      { event: "apifetch", ms: 8 },
    ]);
  });

  it("is a no-op before start()", () => {
    enqueueApiFetch(123);
    enqueueApiFetch(456);
    // No buffered samples -> flush() (guarded by started=false anyway) sends nothing.
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("does not sample glass events — every enqueue() call is kept", async () => {
    start("8.4");
    enqueue("board_glass", 10, "rider");
    enqueue("board_glass", 20, "rider");
    enqueue("board_glass", 30, "rider");
    await flush();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockApiFetch.mock.calls[0] as [string, { body: { samples: unknown[] } }];
    expect(options.body.samples).toHaveLength(3);
  });
});

describe("flush cadence (A-O6: widened 10s -> 30s so a metered-data session doesn't pay a POST's fixed overhead every 10s for 1-2 samples)", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  it("does not flush a quiet buffer at 10s, but does at 30s", async () => {
    start("8.4");
    enqueue("board_glass", 10, "rider"); // below FLUSH_AT, only the interval timer will ship it

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockApiFetch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(20_000); // total 30s
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("AppState background flush", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  afterEach(() => {
    stop();
  });

  it("still flushes immediately on background regardless of the wider interval", async () => {
    start("8.4");
    enqueue("board_glass", 10, "rider");
    mockAppStateListener?.("background");
    await Promise.resolve();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * Cold-start milestones. Launch used to be the one thing the fleet never measured, so these two events
 * are what makes any launch-performance change provable instead of asserted. The clock choice is the
 * subtle part: Metro's `__BUNDLE_START_TIME__` is the only origin that includes module evaluation, but
 * it is stamped with `nativePerformanceNow()` OR `Date.now()` depending on the runtime, and silently
 * subtracting one clock from the other yields garbage rather than an error.
 */
describe("bootElapsedMs (pure)", () => {
  it("measures from the bundle-start origin when both readings share the monotonic clock", () => {
    expect(bootElapsedMs(1_500, 300, 0, 0)).toBe(1_200);
  });

  it("rejects a mismatched origin (Date.now()-based bundle start) and falls back to module load", () => {
    // performance.now() ~2s into the process vs a wall-clock origin: the difference is hugely
    // negative, which must NOT be reported as a latency.
    expect(bootElapsedMs(2_000, 1_762_000_000_000, 1_000_500, 1_000_000)).toBe(500);
  });

  it("rejects an implausibly large difference rather than reporting a nonsense sample", () => {
    expect(bootElapsedMs(9_000_000, 0, 1_000_400, 1_000_000)).toBe(400);
  });

  it("clamps the fallback into the contract's ms bounds when the wall clock steps mid-boot", () => {
    // An NTP sync on a fresh handset can move Date.now() backwards; a negative sample would fail the
    // server's schema and take the whole batch down with it.
    expect(bootElapsedMs(undefined, undefined, 900, 1_000)).toBe(0);
    expect(bootElapsedMs(undefined, undefined, 5_000_000, 0)).toBe(60_000);
  });
});

describe("enqueueBoot", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  afterEach(() => {
    stop();
  });

  it("records each milestone once per process, ignoring a remount", async () => {
    start("8.4");
    enqueueBoot("boot_paint");
    enqueueBoot("boot_paint"); // Fast Refresh / ErrorBoundary retry — must not double-report
    enqueueBoot("boot_home");

    mockAppStateListener?.("background");
    await Promise.resolve();

    const batch = mockApiFetch.mock.calls[0][1].body as { samples: { event: string }[] };
    expect(batch.samples.map((s) => s.event)).toEqual(["boot_paint", "boot_home"]);
  });

  it("stays dormant before start(), like every other enqueue here", async () => {
    enqueueBoot("boot_paint");
    start("8.4");
    enqueue("board_glass", 10, "rider");
    mockAppStateListener?.("background");
    await Promise.resolve();

    const batch = mockApiFetch.mock.calls[0][1].body as { samples: { event: string }[] };
    expect(batch.samples.map((s) => s.event)).toEqual(["board_glass"]);
  });
});
