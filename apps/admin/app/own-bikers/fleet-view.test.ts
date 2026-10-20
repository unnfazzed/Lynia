import { describe, expect, it } from "vitest";
import { OBA } from "../lib/own-bikers-copy";
import { DETAIL, ROWS } from "./fixtures.test-data";
import { asFilter, billPill, billRides, brandOf, filterCounts, filterRows, overdueCell, rideLabel, statusPill, weekLabel } from "./fleet-view";

// The handoff's own strings, to check the templates against. A variable path, so the console's tsc doesn't type-check
// the design package's untyped file.
const HANDOFF = new URL("../../../../packages/design/handoff/own-bikers-v1/copy.ts", import.meta.url).href;
const A = ((await import(/* @vite-ignore */ HANDOFF)) as { OB: { admin: Record<string, unknown> } }).OB.admin;

describe("the console's Own bikers strings are the handoff's (OB.admin)", () => {
  it("fixed strings match word for word", () => {
    for (const k of [
      "nav",
      "title",
      "stOverdue",
      "stUnpaid",
      "stPaid",
      "stPaused",
      "pause",
      "unpause",
      "disable",
      "bills",
      "markPaid",
      "adjust",
      "adjAmount",
      "adjReason",
      "adjRide",
      "reasonCode",
      "note",
      "audit",
      "cancel",
      "emptyT",
      "emptyB",
      "errT",
      "tryAgain",
    ] as const) {
      expect(OBA[k as keyof typeof OBA], k).toBe(A[k]);
    }
    expect([...OBA.cols]).toEqual(A.cols);
  });

  it("the fee strings follow the owner's billing decision, not the handoff (2026-10-20, ledger D-117)", () => {
    // Every business pays the commission rate on its rides: no "Fee per ride" to edit, nothing to Save.
    expect(A.fee).toBe("Fee per ride");
    expect(OBA.fee).toBe("Fee");
    expect(OBA.feeLine(10)).toBe("10% of each ride");
    expect(A.sub).toBe("3 fleets · fee per ride billed weekly");
    expect(OBA.sub(3)).toBe("3 fleets · commission billed weekly");
  });

  it("templates read the same with the handoff's sample data", () => {
    expect(OBA.overdueN(9)).toBe((A.overdueN as (n: number) => string)(9));
    expect(OBA.pauseT("Chicken Inn")).toBe(A.pauseT);
    expect(OBA.pauseB("Chicken Inn", 4)).toBe((A.pauseB as (n: number) => string)(4));
    expect(OBA.disableT("Chicken Inn")).toBe(A.disableT);
    expect(OBA.disableB("Chicken Inn", 4)).toBe((A.disableB as (n: number) => string)(4));
    const t = OBA.tile(3, 14, 2);
    expect(`${t.lead} · ${t.overdue}`).toBe(A.tile);
  });
});

describe("fleet-view", () => {
  it("splits the business from its branches by the words every branch name starts with", () => {
    expect(brandOf(["Chicken Inn Avondale", "Chicken Inn Borrowdale"], "Rumbi")).toEqual({ brand: "Chicken Inn", branches: ["Avondale", "Borrowdale"] });
    expect(brandOf(["Mama's Kitchen"], "Nyasha")).toEqual({ brand: "Mama's Kitchen", branches: ["Mama's Kitchen"] });
    // Nothing in common: every name in full, the first as the business.
    expect(brandOf(["Avondale Spares", "Siyaso Motors"], "Kuda")).toEqual({ brand: "Avondale Spares", branches: ["Avondale Spares", "Siyaso Motors"] });
    // A name that is all prefix keeps one word for the branch.
    expect(brandOf(["Pizza Inn", "Pizza Inn Eastgate"], "Kuda").brand).toBe("Pizza");
    expect(brandOf([], "Rumbi Chari")).toEqual({ brand: "Rumbi Chari", branches: [] });
  });

  it("status pills: overdue in danger, paid in accent, unpaid in gold, paused and disabled muted", () => {
    expect(statusPill("overdue")).toEqual({ label: "Overdue", kind: "bad" });
    expect(statusPill("paid")).toEqual({ label: "Paid", kind: "good" });
    expect(statusPill("unpaid")).toEqual({ label: "Unpaid", kind: "warn" });
    expect(statusPill("paused")).toEqual({ label: "Paused", kind: "mut" });
    expect(statusPill("disabled").kind).toBe("mut");
  });

  it("filters and counts the subnav", () => {
    expect(filterCounts(ROWS)).toEqual({ all: 3, overdue: 2, unpaid: 0, paid: 1, paused: 0 });
    expect(filterRows(ROWS, "paid").map((r) => r.owner)).toEqual(["Nyasha Dube"]);
    expect(filterRows(ROWS, "all")).toHaveLength(3);
    expect(asFilter("overdue")).toBe("overdue");
    expect(asFilter("nonsense")).toBe("all");
  });

  it("days overdue is words, loud past a week, a dash when not late", () => {
    expect(overdueCell(9)).toEqual({ text: "9 days overdue", loud: true });
    expect(overdueCell(2)).toEqual({ text: "2 days overdue", loud: false });
    expect(overdueCell(0)).toEqual({ text: "—", loud: false });
  });

  it("bills: the week, the rides, the pill", () => {
    const [unpaid, overdue, paid] = DETAIL.bills;
    expect(weekLabel(unpaid!.periodStart, unpaid!.periodEnd)).toBe("28 Sep–4 Oct");
    expect(weekLabel(overdue!.periodStart, overdue!.periodEnd)).toBe("21–27 Sep");
    expect(billRides(unpaid!)).toBe(23);
    expect(billPill(unpaid!)).toEqual({ label: "Due Fri 9 Oct", kind: "warn" });
    expect(billPill(overdue!)).toEqual({ label: "2 days overdue", kind: "bad" });
    expect(billPill(paid!)).toEqual({ label: "Paid", kind: "good" });
  });

  it("a ride reads ref · biker · day and time in Harare", () => {
    expect(rideLabel(DETAIL.recentRides![0]!)).toBe("#B190 · Tendai · 4 Oct 10:05");
  });
});
