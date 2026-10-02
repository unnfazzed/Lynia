import type { MerchantHours } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { computeSlotDays, findSlot, harareWallToInstant } from "./order-schedule";

// Harare is UTC+2: 08:00 UTC = 10:00 in Harare. 2026-10-02 is a Friday.
const at = (iso: string) => new Date(iso);
const WEEK: MerchantHours = {
  mon: { open: "10:00", close: "20:00" },
  tue: { open: "10:00", close: "20:00" },
  wed: { open: "10:00", close: "20:00" },
  thu: { open: "10:00", close: "20:00" },
  fri: { open: "10:00", close: "20:00" },
  sat: { open: "10:00", close: "20:00" },
  sun: { open: "10:00", close: "20:00" },
};

describe("order-schedule — BRIEF §12 slot math (Harare wall clock)", () => {
  it("converts a Harare wall time to the right instant (UTC+2, no DST)", () => {
    expect(harareWallToInstant(new Date(2026, 9, 2), 12 * 60 + 30).toISOString()).toBe("2026-10-02T10:30:00.000Z");
  });

  it("offers 30-minute slots whose ring time (slot − lead) is inside hours and not in the past", () => {
    // 11:10 Harare, lead 35 min → first slot must ring ≥ 11:10 → 12:00 (rings 11:25).
    const days = computeSlotDays({ hours: WEEK, closedUntil: null, leadMinutes: 35, now: at("2026-10-02T09:10:00Z") });
    expect(days.today.date).toBe("2026-10-02");
    expect(days.today.slots[0]!.label).toBe("12:00–12:30");
    expect(days.today.slots[0]!.ringsAt.toISOString()).toBe("2026-10-02T09:25:00.000Z");
    // Last slot of the day rings before close (20:00): 20:30 rings 19:55.
    expect(days.today.slots.at(-1)!.label).toBe("20:30–21:00");
    // Tomorrow starts at the first slot that rings after opening: 11:00 (rings 10:25).
    expect(days.tomorrow.date).toBe("2026-10-03");
    expect(days.tomorrow.slots[0]!.label).toBe("11:00–11:30");
  });

  it("a closed venue (before opening) still offers its first slots — 'Order for when they open'", () => {
    const days = computeSlotDays({ hours: WEEK, closedUntil: null, leadMinutes: 35, now: at("2026-10-02T04:00:00Z") });
    expect(days.today.slots[0]!.label).toBe("11:00–11:30");
  });

  it("hides every same-day slot after the venue can no longer make it (open question 4, as drawn)", () => {
    const days = computeSlotDays({ hours: WEEK, closedUntil: null, leadMinutes: 35, now: at("2026-10-02T18:30:00Z") });
    expect(days.today.slots).toEqual([]);
    expect(days.tomorrow.slots.length).toBeGreaterThan(0);
  });

  it("a day with no window, and a venue closed by hand, offer nothing in that time", () => {
    const { fri: _fri, ...noFriday } = WEEK;
    const days = computeSlotDays({ hours: noFriday as MerchantHours, closedUntil: null, leadMinutes: 35, now: at("2026-10-02T06:00:00Z") });
    expect(days.today.slots).toEqual([]);
    const closed = computeSlotDays({ hours: WEEK, closedUntil: at("2026-10-02T22:00:00Z"), leadMinutes: 35, now: at("2026-10-02T06:00:00Z") });
    expect(closed.today.slots).toEqual([]);
    expect(closed.tomorrow.slots.length).toBeGreaterThan(0);
  });

  it("findSlot matches an offered start exactly, and nothing else", () => {
    const days = computeSlotDays({ hours: WEEK, closedUntil: null, leadMinutes: 35, now: at("2026-10-02T06:00:00Z") });
    expect(findSlot(days, "2026-10-02T10:00:00.000Z")?.label).toBe("12:00–12:30");
    expect(findSlot(days, "2026-10-02T12:00:00+02:00")?.label).toBe("12:00–12:30");
    expect(findSlot(days, "2026-10-02T10:15:00.000Z")).toBeNull();
    expect(findSlot(days, "2026-10-05T10:00:00.000Z")).toBeNull();
    expect(findSlot(days, "not a date")).toBeNull();
  });
});
