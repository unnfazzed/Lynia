import { describe, expect, it } from "vitest";
import { enumLabel, fmtDateTime, fmtDayMonth, fmtTime, money, shortId, timeAgo } from "./format";

describe("format", () => {
  it("prints times in Harare (UTC+2), not the server's zone", () => {
    // 22:30 UTC on 13 Oct is 00:30 on 14 Oct in Harare.
    expect(fmtTime("2026-10-13T22:30:00Z")).toBe("00:30");
    expect(fmtDateTime("2026-10-13T22:30:00Z")).toBe("14 Oct, 00:30");
    expect(fmtDayMonth("2026-10-13T22:30:00Z")).toBe("14 Oct");
  });

  it("prints negative money with a leading minus sign and thousands separators", () => {
    expect(money("-3")).toBe("−$3.00");
    expect(money("1234.5")).toBe("$1,234.50");
    expect(money(0)).toBe("$0.00");
    expect(money(null)).toBe("—");
    expect(money("abc")).toBe("—");
  });

  it("shortens ids and labels enums", () => {
    expect(shortId("a1b2c3d4-0000-0000-0000-000000000000")).toBe("#a1b2c3");
    expect(enumLabel("open_for_offers")).toBe("Open for offers");
    expect(enumLabel(null)).toBe("—");
  });

  it("timeAgo", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(timeAgo("2026-10-13T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-10-13T11:15:00Z", now)).toBe("45 min ago");
    expect(timeAgo("2026-10-13T09:00:00Z", now)).toBe("3 hr ago");
  });
});
