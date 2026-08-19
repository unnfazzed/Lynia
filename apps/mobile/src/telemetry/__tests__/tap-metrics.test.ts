jest.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: jest.fn() }) },
}));

const mockApiFetch = jest.fn().mockResolvedValue(undefined);
jest.mock("../../api/client", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { enqueueNavOpen, enqueueTapAck, flush, start, stop } from "../rum";
import { consumeTouch, noteTouch, __resetTapSignal } from "../tap-signal";

/**
 * The two tap metrics (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §3). Before these the RUM
 * taxonomy had seven events and not one of them measured a tap, so the reported symptom was not
 * falsifiable from the fleet at all — every fix in this program could only be judged by feel.
 */

/** The samples the buffer would POST, flattened across role batches. */
async function drain(): Promise<{ event: string; ms: number }[]> {
  mockApiFetch.mockClear();
  await flush();
  return mockApiFetch.mock.calls.flatMap((call) => {
    const body = (call[1] as { body: { samples: { event: string; ms: number }[] } }).body;
    return body.samples;
  });
}

/** Run the frame callback immediately, `ms` after the press. */
const rafAfter = (ms: number) => (cb: () => void) => {
  jest.setSystemTime(Date.now() + ms);
  cb();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-08-19T09:00:00Z"));
  mockApiFetch.mockClear();
  __resetTapSignal();
  start("0.42.0");
});
afterEach(() => {
  stop();
  jest.useRealTimers();
});

describe("enqueueTapAck", () => {
  it("samples one press in four, so the press path stays cheap", () => {
    for (let i = 0; i < 8; i++) enqueueTapAck(rafAfter(20));
    // 8 presses, deterministic 1-in-4 counter → exactly 2 samples, not a probabilistic spread.
    return drain().then((samples) => {
      expect(samples.filter((s) => s.event === "tap_ack")).toHaveLength(2);
    });
  });

  it("measures how long the JS thread took to reach the next frame", async () => {
    for (let i = 0; i < 4; i++) enqueueTapAck(rafAfter(240));
    const samples = await drain();
    expect(samples).toEqual([{ event: "tap_ack", ms: 240 }]);
  });

  it("reads no clock at all on a press it is not going to sample", () => {
    const raf = jest.fn();
    enqueueTapAck(raf); // 1st — skipped
    enqueueTapAck(raf); // 2nd — skipped
    expect(raf).not.toHaveBeenCalled();
  });

  it("is dormant before start() — telemetry must never be the reason a press costs anything", async () => {
    stop();
    const raf = jest.fn();
    for (let i = 0; i < 8; i++) enqueueTapAck(raf);
    expect(raf).not.toHaveBeenCalled();
  });

  it("clamps a device clock that stepped mid-gesture rather than poisoning the batch", async () => {
    for (let i = 0; i < 4; i++) enqueueTapAck(rafAfter(999_999));
    const [sample] = await drain();
    expect(sample?.ms).toBe(60_000);
  });
});

describe("enqueueNavOpen", () => {
  it("is unsampled — every navigation is independently informative", async () => {
    enqueueNavOpen(300);
    enqueueNavOpen(450);
    const samples = await drain();
    expect(samples).toEqual([
      { event: "nav_open", ms: 300 },
      { event: "nav_open", ms: 450 },
    ]);
  });

  it("clamps out-of-range values and is dormant before start()", async () => {
    enqueueNavOpen(-5);
    enqueueNavOpen(10 * 60_000);
    expect(await drain()).toEqual([
      { event: "nav_open", ms: 0 },
      { event: "nav_open", ms: 60_000 },
    ]);
    stop();
    enqueueNavOpen(300);
    expect(await drain()).toEqual([]);
  });
});

describe("tap-signal mailbox", () => {
  it("hands the touch over exactly once, so one press can only open one screen", () => {
    noteTouch(1_000);
    expect(consumeTouch()).toBe(1_000);
    expect(consumeTouch()).toBeNull();
  });

  it("keeps only the most recent press", () => {
    noteTouch(1_000);
    noteTouch(2_000);
    expect(consumeTouch()).toBe(2_000);
  });
});
