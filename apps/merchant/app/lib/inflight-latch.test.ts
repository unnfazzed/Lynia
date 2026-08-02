import { describe, expect, it } from "vitest";
import { InflightLatch } from "./inflight-latch";

describe("InflightLatch", () => {
  it("blocks a second acquire while the first is still fresh", () => {
    let now = 0;
    const latch = new InflightLatch(10_000, () => now);
    expect(latch.tryAcquire()).toBe(true);
    now += 5_000;
    expect(latch.tryAcquire()).toBe(false);
  });

  it("is reusable after release", () => {
    let now = 0;
    const latch = new InflightLatch(10_000, () => now);
    expect(latch.tryAcquire()).toBe(true);
    latch.release();
    now += 1;
    expect(latch.tryAcquire()).toBe(true);
  });

  // LC-C04: this is the self-healing behavior. Without a fetch timeout upstream, a hung request used
  // to leave `inflight = true` forever — every subsequent poll early-returned for the rest of the
  // shift. staleMs is the backstop: a latch held past that window is a stuck latch, not a fresh call,
  // and must not permanently block the board.
  it("self-heals: force-clears and re-acquires once held past staleMs", () => {
    let now = 0;
    const latch = new InflightLatch(10_000, () => now);
    expect(latch.tryAcquire()).toBe(true); // held from t=0, never released (simulates a stuck request)
    now = 9_999;
    expect(latch.tryAcquire()).toBe(false); // still within the stale window
    now = 10_000;
    expect(latch.tryAcquire()).toBe(true); // stale — force-cleared, a fresh poll gets in
  });

  it("does not self-heal prematurely for a normal in-flight call", () => {
    let now = 0;
    const latch = new InflightLatch(10_000, () => now);
    expect(latch.tryAcquire()).toBe(true);
    for (const t of [1_000, 5_000, 9_999]) {
      now = t;
      expect(latch.tryAcquire()).toBe(false);
    }
  });
});
