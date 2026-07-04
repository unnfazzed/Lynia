import { describe, expect, it } from "vitest";
import { isEmpty, plan, pickSurvivor, type ProfileForBackfill } from "./phone-backfill";

const row = (over: Partial<ProfileForBackfill> & { id: string; phone: string }): ProfileForBackfill => ({
  createdAt: new Date("2026-01-01T00:00:00Z"),
  hasRider: false,
  ordersAsCustomer: 0,
  ratingsGiven: 0,
  ...over,
});

describe("phone-backfill plan", () => {
  it("leaves already-canonical rows untouched", () => {
    const p = plan([row({ id: "a", phone: "+263771234567" })]);
    expect(p.unchanged).toBe(1);
    expect(p.renames).toHaveLength(0);
  });

  it("renames a lone non-canonical row whose target is free", () => {
    const p = plan([row({ id: "a", phone: "0771234567" })]);
    expect(p.renames).toEqual([{ id: "a", from: "0771234567", to: "+263771234567" }]);
    expect(p.merges).toHaveLength(0);
  });

  it("merges a collision when the loser is empty, keeping the canonical survivor", () => {
    const p = plan([
      row({ id: "canon", phone: "+263771234567", ordersAsCustomer: 3 }),
      row({ id: "dup", phone: "0771234567" }), // empty duplicate of the same person
    ]);
    expect(p.manual).toHaveLength(0);
    expect(p.merges).toEqual([
      { target: "+263771234567", survivorId: "canon", survivorPhone: "+263771234567", loserIds: ["dup"] },
    ]);
  });

  it("promotes an empty non-canonical survivor to E.164 when it wins the group", () => {
    const p = plan([
      row({ id: "x", phone: "0771234567", createdAt: new Date("2026-01-01") }),
      row({ id: "y", phone: "263771234567", createdAt: new Date("2026-02-01") }),
    ]);
    // Neither is canonical (+263…), both empty → oldest survives, gets rewritten to the target.
    expect(p.merges).toEqual([
      { target: "+263771234567", survivorId: "x", survivorPhone: "0771234567", loserIds: ["y"] },
    ]);
  });

  it("refuses to auto-merge when a non-survivor carries real data", () => {
    const p = plan([
      row({ id: "keep", phone: "+263771234567", ordersAsCustomer: 5 }),
      row({ id: "rider", phone: "0771234567", hasRider: true }), // money/reputation — never fold away
    ]);
    expect(p.merges).toHaveLength(0);
    expect(p.manual).toHaveLength(1);
    expect(p.manual[0].target).toBe("+263771234567");
    expect(p.manual[0].rows.find((r) => r.id === "rider")?.reason).toContain("rider record");
  });

  it("quarantines unparseable phones and still processes the rest", () => {
    const p = plan([row({ id: "bad", phone: "not-a-number" }), row({ id: "ok", phone: "0771230000" })]);
    expect(p.invalid).toEqual([{ id: "bad", phone: "not-a-number" }]);
    expect(p.renames).toEqual([{ id: "ok", from: "0771230000", to: "+263771230000" }]);
  });

  it("prefers a data-bearing survivor over an empty one, and canonical over both", () => {
    const withData = row({ id: "data", phone: "0771234567", ordersAsCustomer: 2 });
    const empty = row({ id: "empty", phone: "263771234567" });
    const canon = row({ id: "canon", phone: "+263771234567" });
    expect(pickSurvivor([withData, empty], "+263771234567").id).toBe("data");
    expect(pickSurvivor([withData, empty, canon], "+263771234567").id).toBe("canon");
  });

  it("isEmpty is true only with no rider, orders, or ratings", () => {
    expect(isEmpty(row({ id: "a", phone: "x" }))).toBe(true);
    expect(isEmpty(row({ id: "a", phone: "x", hasRider: true }))).toBe(false);
    expect(isEmpty(row({ id: "a", phone: "x", ordersAsCustomer: 1 }))).toBe(false);
    expect(isEmpty(row({ id: "a", phone: "x", ratingsGiven: 1 }))).toBe(false);
  });
});
