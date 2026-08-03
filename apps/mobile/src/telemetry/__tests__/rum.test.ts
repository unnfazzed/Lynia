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

import { buildBatches, clampGlassSample, enqueue, enqueueApiFetch, flush, start, stop, type RoleSample } from "../rum";

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
