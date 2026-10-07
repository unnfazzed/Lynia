import { describe, expect, it } from "vitest";
import type { MerchantHours } from "./contracts";
import { categoryServedNow, closingTimeToday, effectiveMerchantHours, isMerchantOpenNow, minutesUntilClose, nextOpenDescription, nextOpening, startOfNextDay } from "./restaurant-hours";

describe("categoryServedNow (MJ-RM12 / U25: one rule for the app and the API)", () => {
  const at = (h: number, m = 0) => new Date(2026, 6, 29, h, m);
  it("is served inside [from, to) and not outside it", () => {
    expect(categoryServedNow("07:00", "11:00", at(7))).toBe(true);
    expect(categoryServedNow("07:00", "11:00", at(10, 59))).toBe(true);
    expect(categoryServedNow("07:00", "11:00", at(11))).toBe(false);
    expect(categoryServedNow("07:00", "11:00", at(6, 59))).toBe(false);
  });
  it("is always served without both bounds", () => {
    expect(categoryServedNow(null, null, at(3))).toBe(true);
    expect(categoryServedNow("07:00", null, at(3))).toBe(true);
    expect(categoryServedNow(undefined, "", at(3))).toBe(true);
  });
});

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

describe("effectiveMerchantHours — closed by hand (merchant mobile B5, D-48)", () => {
  const LATER = new Date(2026, 6, 29, 23, 59);

  it("drops today's window while closed, so the restaurant reads closed and says when it opens next", () => {
    const hours = effectiveMerchantHours(HOURS, LATER, WED_NOON);
    expect(isMerchantOpenNow(hours, WED_NOON)).toBe(false);
    expect(nextOpenDescription(hours, WED_NOON)).toBe("Opens tomorrow at 09:00");
    expect(HOURS.wed).toBeDefined(); // the stored week is never mutated
  });

  it("an always-open restaurant (no hours) reads closed too", () => {
    expect(isMerchantOpenNow(effectiveMerchantHours(null, LATER, WED_NOON), WED_NOON)).toBe(false);
  });

  it("passes the hours through untouched once the close has passed, or when there is none", () => {
    expect(effectiveMerchantHours(HOURS, WED_EARLY, WED_NOON)).toBe(HOURS);
    expect(effectiveMerchantHours(HOURS, null, WED_NOON)).toBe(HOURS);
  });

  it("a close by hand ends at the start of the next day", () => {
    expect(startOfNextDay(WED_NOON)).toEqual(new Date(2026, 6, 30, 0, 0));
  });
});

describe("closingTimeToday / nextOpening (Browse v2, D-57)", () => {
  // 2026-10-01 is a Thursday.
  const week = { mon: { open: "08:00", close: "22:00" }, thu: { open: "10:00", close: "21:30" }, fri: { open: "09:00", close: "22:00" } } as MerchantHours;
  const at = (hhmm: string, day = "2026-10-01"): Date => new Date(`${day}T${hhmm}:00`);

  it("names today's close while open, nothing while closed or with no hours", () => {
    expect(closingTimeToday(week, at("12:00"))).toBe("21:30");
    expect(closingTimeToday(week, at("22:00"))).toBeNull();
    expect(closingTimeToday(null, at("12:00"))).toBeNull();
  });

  it("finds the next opening later today, tomorrow, or later in the week", () => {
    expect(nextOpening(week, at("07:00"))).toEqual({ time: "10:00", dayOffset: 0, day: "Thursday" });
    expect(nextOpening(week, at("23:00"))).toEqual({ time: "09:00", dayOffset: 1, day: "Friday" });
    expect(nextOpening(week, at("23:00", "2026-10-02"))).toEqual({ time: "08:00", dayOffset: 3, day: "Monday" });
    expect(nextOpening(week, at("12:00"))).toBeNull();
  });
});
