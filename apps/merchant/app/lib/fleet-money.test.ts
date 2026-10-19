import { describe, expect, it } from "vitest";
import type { FleetBill, FleetBillsResponse, FleetRidesResponse } from "@lynia/shared";
import { billCards, billWeek, branchLines, dueLabel, noFleetRides, rideRows } from "./fleet-money";

const ORDER = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const AV = "11111111-1111-4111-8111-111111111111";
const BO = "22222222-2222-4222-8222-222222222222";

const bill = (over: Partial<FleetBill>): FleetBill => ({
  id: over.id ?? "33333333-3333-4333-8333-333333333333",
  periodStart: "2026-09-21",
  periodEnd: "2026-09-27",
  dueOn: "2026-10-02",
  total: "36.00",
  state: "unpaid",
  daysOverdue: 0,
  paidAt: null,
  branches: [],
  ...over,
});

const bills = (b: FleetBill[], thisWeek: FleetBillsResponse["thisWeek"] = { rides: 0, total: "0.00", branches: [] }): FleetBillsResponse => ({ thisWeek, bills: b });

const rides = (lines: FleetRidesResponse["lines"], r = 0, total = "0.00"): FleetRidesResponse => ({ weekStart: "2026-09-28", weekEnd: "2026-10-04", rides: r, total, lines });

describe("OB-M14 fleet money", () => {
  it("names a bill's week and its due day the handoff's way", () => {
    expect(billWeek("2026-09-21", "2026-09-27")).toBe("21–27 Sep");
    expect(billWeek("2026-09-28", "2026-10-04")).toBe("28 Sep–4 Oct");
    // Due in the coming week: the weekday alone; further out or past: with the date.
    expect(dueLabel("2026-10-09", "2026-10-04")).toBe("Fri");
    expect(dueLabel("2026-10-02", "2026-10-04")).toBe("Fri 2 Oct");
  });

  it("bill cards: last week's overdue bill in danger above this week's running bill, due the Friday after it ends", () => {
    const cards = billCards(
      bills([bill({ state: "overdue", daysOverdue: 2 })], { rides: 23, total: "34.50" }),
      "2026-09-28",
      "2026-10-04",
    );
    expect(cards).toEqual([
      { key: expect.any(String), state: "overdue", text: "Fleet bill · 21–27 Sep · $36.00 · Due Fri 2 Oct", daysOverdue: 2 },
      { key: "week-2026-09-28", state: "unpaid", text: "Fleet bill · 28 Sep–4 Oct · $34.50 · Due Fri", daysOverdue: 0 },
    ]);
  });

  it("last week's bill shows Paid only when nothing is owed; older paid bills don't show", () => {
    const paid = bill({ state: "paid", periodStart: "2026-09-21", periodEnd: "2026-09-27" });
    expect(billCards(bills([paid]), "2026-09-28", "2026-10-04").map((c) => c.state)).toEqual(["paid"]);
    expect(billCards(bills([paid]), "2026-10-05", "2026-10-06")).toEqual([]);
    const owed = bill({ id: "44444444-4444-4444-8444-444444444444", periodStart: "2026-09-14", periodEnd: "2026-09-20", state: "overdue", daysOverdue: 9 });
    expect(billCards(bills([paid, owed]), "2026-09-28", "2026-10-04").map((c) => c.state)).toEqual(["overdue"]);
  });

  it("ride rows name the biker; a ride credited back to nothing is muted with its credit, in mint", () => {
    const r = rides([
      { orderId: ORDER(1), ref: "#B204", at: "2026-10-04T10:40:00Z", kind: "booking", fee: "1.50", reason: null, biker: "Tendai" },
      { orderId: ORDER(2), ref: "#B190", at: "2026-10-04T08:05:00Z", kind: "marketplace", fee: "1.50", reason: null, biker: "Tendai" },
      { orderId: ORDER(2), ref: "#B190", at: "2026-10-04T09:00:00Z", kind: "adjustment", fee: "-1.50", reason: "wrong fee", biker: null },
    ]);
    const rows = rideRows(r);
    expect(rows[0]).toMatchObject({ amount: "$1.50", muted: false, credit: false });
    expect(rows[0]!.text).toMatch(/^#B204 · Tendai · \d\d:\d\d$/);
    expect(rows[1]).toMatchObject({ muted: true, credit: false });
    expect(rows[2]).toMatchObject({ text: "Credit · #B190 · wrong fee", amount: "−$1.50", muted: true, credit: true });
  });

  it("branch lines: this branch first, then the owner's other branches; nothing anywhere is the zero row", () => {
    const data = {
      rides: rides([{ orderId: ORDER(1), ref: "#B204", at: "2026-10-04T10:40:00Z", kind: "booking", fee: "1.50", reason: null, biker: "Tendai" }], 15, "22.50"),
      bills: bills([], {
        rides: 23,
        total: "34.50",
        branches: [
          { merchantId: BO, name: "Borrowdale", rides: 8, total: "12.00" },
          { merchantId: AV, name: "Avondale", rides: 15, total: "22.50" },
        ],
      }),
    };
    expect(branchLines(data, AV, "Chicken Inn").map((b) => b.text)).toEqual(["Avondale · 15 rides · $22.50", "Borrowdale · 8 rides · $12.00"]);
    expect(noFleetRides(data)).toBe(false);
    expect(noFleetRides({ rides: rides([]), bills: bills([]) })).toBe(true);
  });
});
