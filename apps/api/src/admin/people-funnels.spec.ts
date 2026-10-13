import { describe, expect, it } from "vitest";
import {
  buildFunnel,
  dialable,
  earliest,
  FUNNEL_STEPS,
  median,
  NUDGE_COPY,
  nudgeCopy,
  rangeWindow,
  reached,
  STUCK_LIST_KEYS,
  STUCK_LISTS,
  type StepDef,
} from "./people-funnels";

/** Admin console v2 §4: the funnel maths, the Harare ranges and the Nudge copy. */

const HOUR = 60 * 60 * 1000;
const t = (h: number) => new Date(Date.UTC(2026, 9, 13, 8) + h * HOUR);

describe("rangeWindow (Harare days)", () => {
  const now = new Date("2026-10-13T21:30:00Z"); // 23:30 in Harare, still 13 Oct
  it("today starts at 00:00 Harare (22:00 UTC the day before)", () => {
    expect(rangeWindow("today", now).from.toISOString()).toBe("2026-10-12T22:00:00.000Z");
  });
  it("7d is today and the six days before; 30d is today and the 29 before", () => {
    expect(rangeWindow("7d", now).from.toISOString()).toBe("2026-10-06T22:00:00.000Z");
    expect(rangeWindow("30d", now).from.toISOString()).toBe("2026-09-13T22:00:00.000Z");
    expect(rangeWindow("30d", now).to).toBe(now);
  });
  it("just after Harare midnight is already the next day", () => {
    expect(rangeWindow("today", new Date("2026-10-13T22:05:00Z")).from.toISOString()).toBe("2026-10-13T22:00:00.000Z");
  });
});

describe("median", () => {
  it("odd, even and empty", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3); // (2+3)/2 rounded
    expect(median([])).toBeNull();
  });
});

describe("buildFunnel", () => {
  const defs: StepDef[] = [
    { key: "a", label: "A", since: null, timesSince: null, timed: true, stuckList: null },
    { key: "b", label: "B", since: null, timesSince: null, timed: false, stuckList: null },
    { key: "c", label: "C", since: "2026-10-13", timesSince: "2026-10-13", timed: true, stuckList: "biker_no_didit" },
    { key: "d", label: "D", since: null, timesSince: null, timed: true, stuckList: null },
  ];

  it("counts each step on its own definition, with share of cohort and step conversion", () => {
    const out = buildFunnel(defs, [
      { a: t(0), b: true, c: t(2), d: t(5) },
      { a: t(0), b: true, c: t(4) },
      { a: t(0), b: true },
      { a: t(0), d: t(1) }, // reached d without c (out of order): still counts for d
    ]);
    expect(out.map((s) => s.count)).toEqual([4, 3, 2, 2]);
    expect(out[0]).toMatchObject({ pctOfCohort: 100, conversionPct: null, medianMs: null });
    expect(out[1]).toMatchObject({ pctOfCohort: 75, conversionPct: 75, medianMs: null, timedCount: 0 });
    expect(out[2]).toMatchObject({ pctOfCohort: 50, conversionPct: 66.7, since: "2026-10-13", stuckList: "biker_no_didit" });
    // Of the two who reached c, one reached d (the fourth reached d without c and doesn't inflate it past 100%).
    expect(out[3].conversionPct).toBe(50);
  });

  it("the median runs from the nearest earlier TIMED step, skipping an untimed one", () => {
    const out = buildFunnel(defs, [
      { a: t(0), b: true, c: t(2) },
      { a: t(0), b: true, c: t(4) },
      { a: t(0), b: true, c: t(6) },
    ]);
    expect(out[2].medianMs).toBe(4 * HOUR);
    expect(out[2].timedCount).toBe(3);
  });

  it("drops gaps of zero (a backfilled time) and negative gaps (a step taken out of order)", () => {
    const out = buildFunnel(defs, [
      { a: t(0), c: t(0) },
      { a: t(3), c: t(1) },
      { a: t(0), c: t(2) },
    ]);
    expect(out[2]).toMatchObject({ medianMs: 2 * HOUR, timedCount: 1 });
  });

  it("measures from the step before when the person has no time for this step's predecessor", () => {
    const out = buildFunnel(defs, [{ a: t(0), c: true, d: t(3) }]);
    // c reached with no time → d is measured from a.
    expect(out[3]).toMatchObject({ medianMs: 3 * HOUR, timedCount: 1 });
  });

  it("an empty cohort has no percentages", () => {
    const out = buildFunnel(defs, []);
    expect(out.every((s) => s.count === 0 && s.pctOfCohort === null && s.conversionPct === null)).toBe(true);
  });
});

describe("step definitions", () => {
  it("are the plan's happy paths, in order", () => {
    expect(FUNNEL_STEPS.biker.map((s) => s.label)).toEqual([
      "Signed up",
      "Profile",
      "Became a biker",
      "Started ID check",
      "ID verified",
      "Plate verified",
      "First online",
      "First job",
      "10th job",
      "First top-up",
      "Active this week",
    ]);
    expect(FUNNEL_STEPS.customer.map((s) => s.key)).toEqual(["signed_up", "first_order", "delivered", "rated", "second_order"]);
    expect(FUNNEL_STEPS.merchant.map((s) => s.key)).toEqual(["signed_up", "pin_hours", "menu_photos", "called", "approved", "live", "first_order", "first_completed", "ten_orders"]);
  });

  it("say when a step only has data since PR 2", () => {
    const called = FUNNEL_STEPS.merchant.find((s) => s.key === "called")!;
    expect(called.since).toBe("2026-10-13");
    expect(FUNNEL_STEPS.biker.find((s) => s.key === "first_online")!.timesSince).toBe("2026-10-13");
    expect(FUNNEL_STEPS.biker.find((s) => s.key === "first_job")!.timesSince).toBeNull();
  });

  it("every stuck list a bar links to exists, and on the same side", () => {
    for (const [kind, steps] of Object.entries(FUNNEL_STEPS)) {
      for (const s of steps) {
        if (!s.stuckList) continue;
        expect(STUCK_LISTS.find((l) => l.key === s.stuckList)?.kind).toBe(kind);
      }
    }
  });

  it("user-visible copy says biker, never rider (D-101)", () => {
    const copy = [
      ...Object.values(FUNNEL_STEPS).flatMap((s) => s.map((x) => x.label)),
      ...STUCK_LISTS.flatMap((l) => [l.title, l.line]),
      ...Object.values(NUDGE_COPY).flatMap((c) => [c!.title, c!.body]),
    ];
    for (const line of copy) expect(line).not.toMatch(/\brider/i);
  });
});

describe("Nudge copy", () => {
  it("every nudgeable list has copy; the ones ops act on have none", () => {
    for (const l of STUCK_LISTS) {
      if (l.nudge) expect(nudgeCopy(l.key)).not.toBeNull();
      else expect(nudgeCopy(l.key)).toBeNull();
    }
    expect(nudgeCopy("biker_plate_waiting")).toBeNull();
    expect(nudgeCopy("merchant_applications")).toBeNull();
    expect(STUCK_LISTS.map((l) => l.key).sort()).toEqual([...STUCK_LIST_KEYS].sort());
  });

  it("is short, and the balance copy follows the per-job rule (no floor, D-102 / D-104)", () => {
    for (const c of Object.values(NUDGE_COPY)) {
      expect(c!.title.length).toBeLessThanOrEqual(40);
      expect(c!.body.length).toBeLessThanOrEqual(110);
      expect(`${c!.title} ${c!.body}`).not.toMatch(/floor|below \$|minimum/i);
    }
    expect(NUDGE_COPY.biker_low_balance!.body).toContain("when your balance covers its commission");
    expect(NUDGE_COPY.biker_low_balance!.data.kind).toBe("free_jobs");
  });

  it("taps land where installed apps already route: the biker board, or Home for a customer", () => {
    expect(NUDGE_COPY.biker_no_didit!.data).toEqual({ kind: "account" });
    expect(NUDGE_COPY.customer_expired!.data).toEqual({ kind: "account", to: "customer" });
  });
});

describe("helpers", () => {
  it("earliest / reached", () => {
    expect(earliest(null, t(3), undefined, t(1))).toEqual(t(1));
    expect(earliest(null, undefined)).toBeNull();
    expect(reached(true, null)).toBe(true);
    expect(reached(false, null)).toBeUndefined();
    expect(reached(true, t(2))).toEqual(t(2));
  });
  it("dialable drops booking accounts and erased tombstones", () => {
    expect(dialable("+263771234567")).toBe("+263771234567");
    expect(dialable("business:abc")).toBeNull();
    expect(dialable("erased:abc")).toBeNull();
    expect(dialable(null)).toBeNull();
  });
});
