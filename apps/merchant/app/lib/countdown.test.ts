import { describe, expect, it } from "vitest";
import { formatCountdown, msSince, msUntil } from "./countdown";

describe("msUntil", () => {
  it("0 for a null deadline", () => {
    expect(msUntil(null, Date.now())).toBe(0);
  });
  it("the gap between now and the deadline", () => {
    expect(msUntil("2026-07-30T12:03:00.000Z", new Date("2026-07-30T12:00:00.000Z").getTime())).toBe(3 * 60 * 1000);
  });
  it("never negative — a passed deadline clamps to 0", () => {
    expect(msUntil("2026-07-30T11:59:00.000Z", new Date("2026-07-30T12:00:00.000Z").getTime())).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("mm:ss, zero-padded seconds", () => {
    expect(formatCountdown(2 * 60 * 1000 + 41 * 1000)).toBe("2:41");
    expect(formatCountdown(38 * 1000)).toBe("0:38");
    expect(formatCountdown(0)).toBe("0:00");
  });
  it("clamps negative input to 0:00", () => {
    expect(formatCountdown(-500)).toBe("0:00");
  });
});

describe("msSince", () => {
  it("0 for a null start", () => {
    expect(msSince(null, Date.now())).toBe(0);
  });
  it("elapsed time since start", () => {
    expect(msSince("2026-07-30T12:00:00.000Z", new Date("2026-07-30T12:00:38.000Z").getTime())).toBe(38 * 1000);
  });
});
