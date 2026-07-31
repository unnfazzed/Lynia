import { describe, expect, it } from "vitest";
import { dayKeyFor, formatWindow, isValidWindow, rightNowStatus, type PartialMerchantHours } from "./hours";

describe("dayKeyFor", () => {
  it("maps JS Sunday (0) to sun and Monday (1) to mon", () => {
    expect(dayKeyFor(new Date("2026-07-26T10:00:00"))).toBe("sun"); // a Sunday
    expect(dayKeyFor(new Date("2026-07-27T10:00:00"))).toBe("mon"); // a Monday
    expect(dayKeyFor(new Date("2026-08-01T10:00:00"))).toBe("sat"); // a Saturday
  });
});

describe("formatWindow", () => {
  it("formats a window as open – close", () => {
    expect(formatWindow({ open: "09:00", close: "21:00" })).toBe("09:00 – 21:00");
  });
  it("reads an absent window as Closed", () => {
    expect(formatWindow(undefined)).toBe("Closed");
  });
});

describe("isValidWindow", () => {
  it("accepts open before close", () => {
    expect(isValidWindow({ open: "09:00", close: "21:00" })).toBe(true);
  });
  it("rejects open at or after close", () => {
    expect(isValidWindow({ open: "21:00", close: "21:00" })).toBe(false);
    expect(isValidWindow({ open: "22:00", close: "09:00" })).toBe(false);
  });
});

describe("rightNowStatus", () => {
  const hours: PartialMerchantHours = { mon: { open: "09:00", close: "21:00" } };

  it("reports open with the closing time while inside today's window", () => {
    expect(rightNowStatus(hours, new Date("2026-07-27T14:30:00"))).toEqual({ open: true, label: "Open until 21:00" });
  });

  it("reports the opening time before today's window starts", () => {
    expect(rightNowStatus(hours, new Date("2026-07-27T06:00:00"))).toEqual({ open: false, label: "Opens at 09:00" });
  });

  it("reports closed after today's window ends", () => {
    expect(rightNowStatus(hours, new Date("2026-07-27T22:00:00"))).toEqual({ open: false, label: "Closed for today" });
  });

  it("reports closed today when the day has no window at all", () => {
    expect(rightNowStatus(hours, new Date("2026-07-28T14:00:00"))).toEqual({ open: false, label: "Closed today" });
  });

  it("reports closed today when hours are null (never set)", () => {
    expect(rightNowStatus(null, new Date("2026-07-27T14:00:00"))).toEqual({ open: false, label: "Closed today" });
  });
});
