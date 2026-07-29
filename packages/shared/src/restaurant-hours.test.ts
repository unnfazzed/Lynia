import { describe, expect, it } from "vitest";
import type { MerchantHours } from "./contracts";
import { isMerchantOpenNow, minutesUntilClose, nextOpenDescription } from "./restaurant-hours";

// Wednesday 2026-07-29 (matches the plan's "today"); getDay() === 3.
const WED_NOON = new Date(2026, 6, 29, 12, 0);
const WED_LATE = new Date(2026, 6, 29, 22, 0);
const WED_EARLY = new Date(2026, 6, 29, 6, 0);
const WED_CLOSING_SOON = new Date(2026, 6, 29, 20, 45);

const HOURS: MerchantHours = { wed: { open: "09:00", close: "21:00" }, thu: { open: "09:00", close: "21:00" } };

describe("isMerchantOpenNow", () => {
  it("is open within today's window", () => {
    expect(isMerchantOpenNow(HOURS, WED_NOON)).toBe(true);
  });

  it("is closed before/after today's window", () => {
    expect(isMerchantOpenNow(HOURS, WED_EARLY)).toBe(false);
    expect(isMerchantOpenNow(HOURS, WED_LATE)).toBe(false);
  });

  it("is closed on a day absent from the hours map", () => {
    const fridayNoon = new Date(2026, 6, 31, 12, 0);
    expect(isMerchantOpenNow(HOURS, fridayNoon)).toBe(false);
  });

  it("fails open (true) when no hours are configured at all", () => {
    expect(isMerchantOpenNow(null, WED_LATE)).toBe(true);
  });
});

describe("minutesUntilClose", () => {
  it("is null when not closing within the window", () => {
    expect(minutesUntilClose(HOURS, WED_NOON)).toBeNull();
  });

  it("returns the remaining minutes when closing soon", () => {
    expect(minutesUntilClose(HOURS, WED_CLOSING_SOON)).toBe(15);
  });

  it("is null once actually closed", () => {
    expect(minutesUntilClose(HOURS, WED_LATE)).toBeNull();
  });

  it("is null with no hours configured", () => {
    expect(minutesUntilClose(null, WED_NOON)).toBeNull();
  });
});

describe("nextOpenDescription", () => {
  it("names today's opening time when still ahead", () => {
    expect(nextOpenDescription(HOURS, WED_EARLY)).toBe("Opens today at 09:00");
  });

  it("names tomorrow when today's window has already passed", () => {
    expect(nextOpenDescription(HOURS, WED_LATE)).toBe("Opens tomorrow at 09:00");
  });

  it("names the next configured day further out", () => {
    const thuLate = new Date(2026, 6, 30, 22, 0); // Thursday, after close, Friday/Sat/Sun/Mon/Tue absent
    expect(nextOpenDescription(HOURS, thuLate)).toBe("Opens Wednesday at 09:00");
  });

  it("is null when no hours are configured", () => {
    expect(nextOpenDescription(null, WED_NOON)).toBeNull();
  });

  it("is null while currently open", () => {
    expect(nextOpenDescription(HOURS, WED_NOON)).toBeNull();
  });
});
