import { describe, expect, it } from "vitest";
import { byNewest, clampLimit, decodeCursor, encodeCursor, humanize, isAfterCursor, money, parseHarareBound, uuidPrefixRange } from "./admin-read.shared";

describe("admin read helpers (console v2 PR 3)", () => {
  it("round-trips a cursor and rejects junk", () => {
    const c = { at: new Date("2026-10-13T10:00:00.000Z"), key: "a:0f8e" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("nope|").toString("base64url"))).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("orders newest first with the key as tiebreak, and pages strictly after the cursor", () => {
    const t = new Date("2026-10-13T10:00:00Z");
    const rows = [
      { at: new Date("2026-10-13T09:00:00Z"), key: "b" },
      { at: t, key: "a" },
      { at: t, key: "c" },
    ];
    expect([...rows].sort(byNewest).map((r) => r.key)).toEqual(["c", "a", "b"]);
    const cursor = { at: t, key: "c" };
    expect(rows.filter((r) => isAfterCursor(r, cursor)).map((r) => r.key)).toEqual(["b", "a"]);
    expect(isAfterCursor(rows[0]!, null)).toBe(true);
  });

  it("reads a bare day as a whole Harare day (UTC+2) and other values as instants", () => {
    expect(parseHarareBound("2026-10-13", "from")?.toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(parseHarareBound("2026-10-13", "to")?.toISOString()).toBe("2026-10-13T22:00:00.000Z");
    expect(parseHarareBound("2026-10-13T08:30:00Z", "from")?.toISOString()).toBe("2026-10-13T08:30:00.000Z");
    expect(parseHarareBound("yesterday", "from")).toBeNull();
    expect(parseHarareBound(undefined, "to")).toBeNull();
  });

  it("turns a short id or uuid prefix into an inclusive uuid range", () => {
    expect(uuidPrefixRange("#A1B2C3")).toEqual({
      gte: "a1b2c300-0000-0000-0000-000000000000",
      lte: "a1b2c3ff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(uuidPrefixRange("a1b2c3d4-e5f6")?.gte).toBe("a1b2c3d4-e5f6-0000-0000-000000000000");
    expect(uuidPrefixRange("a1b2c")).toBeNull();
    expect(uuidPrefixRange("hello!")).toBeNull();
  });

  it("clamps limits, formats money and says biker", () => {
    expect(clampLimit("500", 50, 100)).toBe(100);
    expect(clampLimit("abc", 50, 100)).toBe(50);
    expect(clampLimit(0, 50, 100)).toBe(50);
    expect(money(-3)).toBe("−$3.00");
    expect(money("1234.5")).toBe("$1,234.50");
    expect(humanize("rider_cancelled")).toBe("Biker cancelled");
    expect(humanize("order.riders_available_notify")).toBe("Order bikers available notify");
  });
});
