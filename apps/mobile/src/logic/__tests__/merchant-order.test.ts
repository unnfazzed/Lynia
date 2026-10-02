import type { SubstitutionRoundView } from "@lynia/shared";
import {
  codeCopied,
  codeGroups,
  codeShown,
  merchantEta,
  prepProgress,
  readyAtMs,
  resolveMerchantStage,
  roundClock,
  roundTakenOff,
  serverTrackStep,
  shortOrderId,
  type StageInput,
  substitutionLines,
  substitutionState,
  trackStep,
} from "../merchant-order";

/** Order flow v2 (ledger D-59): the customer's merchant-order stage machine, track, ETA and codes. */

const NOW = Date.parse("2026-10-02T12:30:00.000Z");
const VENUE = { lat: -17.8292, lng: 31.0522 };
const DROP = { lat: -17.8105, lng: 31.0705 };

const base = (over: Partial<StageInput> = {}): StageInput => ({
  status: "requested",
  merchantPhase: "preparing",
  autoAccepted: false,
  kitchenConfirmedAt: null,
  riderId: null,
  sawRider: false,
  rider: null,
  venue: VENUE,
  dropoff: DROP,
  assignedAt: null,
  handshakeStarted: false,
  nowMs: NOW,
  ...over,
});

describe("trackStep — Confirmed → Cooking → On the way → Delivered from status + merchantPhase", () => {
  it.each([
    [{ status: "requested", merchantPhase: "awaiting_accept" }, 0],
    [{ status: "requested", merchantPhase: "awaiting_item_approval" }, 0],
    [{ status: "requested", merchantPhase: "awaiting_payment" }, 0],
    [{ status: "requested", merchantPhase: "preparing" }, 1],
    [{ status: "requested", merchantPhase: "ready_for_pickup" }, 1],
    [{ status: "assigned", merchantPhase: null }, 1],
    [{ status: "en_route_pickup", merchantPhase: null }, 1],
    [{ status: "picked_up", merchantPhase: null }, 2],
    [{ status: "en_route_dropoff", merchantPhase: null }, 2],
    [{ status: "delivered", merchantPhase: null }, 4],
    [{ status: "completed", merchantPhase: null }, 4],
  ])("%j → step %i", (i, step) => {
    expect(trackStep(i)).toBe(step);
  });

  it("an auto-accepted order the kitchen hasn't confirmed is still step 1 (Confirmed), not Cooking", () => {
    expect(trackStep({ status: "requested", merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null })).toBe(0);
    expect(trackStep({ status: "requested", merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: "2026-10-02T12:00:00Z" })).toBe(1);
  });
});

describe("resolveMerchantStage", () => {
  it("maps the pre-rider phases to T2 / T3 / U2 / T4 / T11a / T11b", () => {
    expect(resolveMerchantStage(base({ merchantPhase: "preparing", autoAccepted: true })).stage).toBe("confirming");
    expect(resolveMerchantStage(base({ merchantPhase: "awaiting_accept" })).stage).toBe("waiting");
    expect(resolveMerchantStage(base({ merchantPhase: "awaiting_item_approval" })).stage).toBe("itemApproval");
    expect(resolveMerchantStage(base()).stage).toBe("cooking");
    expect(resolveMerchantStage(base({ merchantPhase: "ready_for_pickup" })).stage).toBe("slowRider");
    expect(resolveMerchantStage(base({ merchantPhase: "ready_for_pickup", sawRider: true })).stage).toBe("riderDropped");
  });

  it("a rider heading to the venue is T6, and T7 once within ~150 m of it", () => {
    const fix = { lat: -17.84, lng: 31.04, at: new Date(NOW - 5_000).toISOString() };
    expect(resolveMerchantStage(base({ status: "assigned", merchantPhase: null, riderId: "r1", rider: fix })).stage).toBe("toVenue");
    const there = { lat: VENUE.lat + 0.0005, lng: VENUE.lng, at: new Date(NOW - 5_000).toISOString() };
    expect(resolveMerchantStage(base({ status: "en_route_pickup", merchantPhase: null, riderId: "r1", rider: there })).stage).toBe("collecting");
  });

  it("no fix ⇒ noFix (no ETA); a fix older than a minute ⇒ GPS paused", () => {
    const r = resolveMerchantStage(base({ status: "assigned", merchantPhase: null, riderId: "r1" }));
    expect(r).toEqual({ stage: "toVenue", noFix: true, gpsPaused: false });
    const old = { ...DROP, lat: DROP.lat - 0.02, at: new Date(NOW - 90_000).toISOString() };
    expect(resolveMerchantStage(base({ status: "picked_up", merchantPhase: null, riderId: "r1", rider: old })).gpsPaused).toBe(true);
  });

  it("after collection: on the way, then at the door within ~150 m or once the cash handshake has started", () => {
    const far = { lat: -17.83, lng: 31.05, at: new Date(NOW).toISOString() };
    expect(resolveMerchantStage(base({ status: "en_route_dropoff", merchantPhase: null, riderId: "r1", rider: far })).stage).toBe("onWay");
    const near = { lat: DROP.lat + 0.0003, lng: DROP.lng, at: new Date(NOW).toISOString() };
    expect(resolveMerchantStage(base({ status: "en_route_dropoff", merchantPhase: null, riderId: "r1", rider: near })).stage).toBe("door");
    expect(resolveMerchantStage(base({ status: "en_route_dropoff", merchantPhase: null, riderId: "r1", rider: far, handshakeStarted: true })).stage).toBe("door");
    // picked_up is never the door, even when close.
    expect(resolveMerchantStage(base({ status: "picked_up", merchantPhase: null, riderId: "r1", rider: near })).stage).toBe("onWay");
  });

  it("terminals", () => {
    expect(resolveMerchantStage(base({ status: "delivered" })).stage).toBe("delivered");
    expect(resolveMerchantStage(base({ status: "completed" })).stage).toBe("completed");
    expect(resolveMerchantStage(base({ status: "cancelled" })).stage).toBe("cancelled");
    expect(resolveMerchantStage(base({ status: "undelivered" })).stage).toBe("undelivered");
  });
});

describe("merchantEta — a range until collection, one time after, none without a fix", () => {
  const readyMs = NOW + 12 * 60_000;

  it("cooking: a 15-minute range on 5-minute marks", () => {
    const e = merchantEta({ stage: "cooking", noFix: false, nowMs: NOW, readyMs, venue: VENUE, dropoff: DROP, rider: null });
    expect(e?.kind).toBe("range");
    if (e?.kind !== "range") throw new Error("range");
    expect(e.toMs - e.fromMs).toBe(15 * 60_000);
    expect(e.fromMs % (5 * 60_000)).toBe(0);
    expect(e.fromMs).toBeGreaterThanOrEqual(Math.floor(readyMs / 300_000) * 300_000);
  });

  it("no prep data before a rider ⇒ no ETA", () => {
    expect(merchantEta({ stage: "cooking", noFix: false, nowMs: NOW, readyMs: null, venue: VENUE, dropoff: DROP, rider: null })).toBeNull();
    expect(merchantEta({ stage: "waiting", noFix: false, nowMs: NOW, readyMs, venue: VENUE, dropoff: DROP, rider: null })).toBeNull();
  });

  it("a rider stage without a fix ⇒ no ETA (the sentence only)", () => {
    expect(merchantEta({ stage: "toVenue", noFix: true, nowMs: NOW, readyMs, venue: VENUE, dropoff: DROP, rider: null })).toBeNull();
    expect(merchantEta({ stage: "onWay", noFix: true, nowMs: NOW, readyMs, venue: VENUE, dropoff: DROP, rider: null })).toBeNull();
  });

  it("after collection: one time from the rider's fix", () => {
    const e = merchantEta({ stage: "onWay", noFix: false, nowMs: NOW, readyMs, venue: VENUE, dropoff: DROP, rider: { lat: -17.82, lng: 31.06 } });
    expect(e?.kind).toBe("one");
    if (e?.kind !== "one") throw new Error("one");
    expect(e.minutes).toBeGreaterThanOrEqual(1);
    expect(e.atMs).toBe(NOW + e.minutes * 60_000);
  });
});

describe("prep progress", () => {
  it("minutes left (≥ 1) and the share done", () => {
    const o = { prepStartedAt: new Date(NOW - 8 * 60_000).toISOString(), prepMinutes: 20 };
    expect(prepProgress(o, NOW)).toEqual({ minutesLeft: 12, pct: 40 });
    expect(readyAtMs(o)).toBe(NOW + 12 * 60_000);
    expect(prepProgress({ ...o, prepMinutes: 5 }, NOW)?.minutesLeft).toBe(1);
    expect(prepProgress({ prepStartedAt: null, prepMinutes: 20 }, NOW)).toBeNull();
  });
});

describe("codes — 6 digits shown 3+3, copied without the space (BRIEF §16)", () => {
  it("groups and copies", () => {
    expect(codeGroups("418290")).toEqual(["418", "290"]);
    expect(codeShown("418290")).toBe("418 290");
    expect(codeCopied("418 290")).toBe("418290");
  });
  it("the order number", () => {
    expect(shortOrderId("a1b2c3d4-0000-4000-8000-000000000001")).toBe("A1B2");
  });
});

// ── round 2: server track, substitution ─────────────────────────────────────────────────────────────

const line = (over: Partial<SubstitutionRoundView["lines"][number]>): SubstitutionRoundView["lines"][number] => ({
  id: "l1",
  itemId: "i1",
  action: "remove",
  name: "x",
  priceUsd: 1,
  quantity: 1,
  newQuantity: null,
  swapDishId: null,
  swapName: null,
  swapPriceUsd: null,
  swapQuantity: null,
  swapPhotoUrl: null,
  answer: null,
  ...over,
});
/** The handoff's Avondale Fresh sample: $14.60 + $1.50 = $16.10; bread / Mazoe / oil. */
const U2B: SubstitutionRoundView = {
  id: "r1",
  kind: "at_accept",
  status: "open",
  createdAt: new Date(NOW - 19_000).toISOString(),
  deadlineAt: new Date(NOW + 161_000).toISOString(),
  resolvedAt: null,
  wasTotal: 16.1,
  keptSubtotal: 5.5,
  lines: [
    line({ id: "bread", name: "Bread (Lobels 700g)", action: "swap", priceUsd: 1.1, swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1 }),
    line({ id: "mazoe", name: "Mazoe orange 2L", action: "remove", priceUsd: 3.2 }),
    line({ id: "oil", name: "Cooking oil 2L", action: "swap", priceUsd: 4.8, swapName: "Olivine cooking oil 2L", swapPriceUsd: 5, swapQuantity: 1 }),
  ],
};

describe("server track (Backend A)", () => {
  it("prefers the server's track; delivered is every step done; falls back to the phone", () => {
    expect(serverTrackStep({ status: "requested", merchantPhase: "awaiting_accept" }, { step: "making", index: 1, rxChecked: false })).toBe(1);
    expect(serverTrackStep({ status: "delivered", merchantPhase: null }, { step: "delivered", index: 3, rxChecked: false })).toBe(4);
    expect(serverTrackStep({ status: "picked_up", merchantPhase: null }, null)).toBe(2);
    expect(serverTrackStep({ status: "requested", merchantPhase: "awaiting_accept" }, undefined)).toBe(0);
  });
});

describe("substitution (BRIEF §8)", () => {
  it("U2b: bread swap accepted, Mazoe removed, oil declined → $16.10 → $8.20", () => {
    expect(substitutionState(U2B, 1.5, { bread: "accept", oil: "remove" })).toEqual({ was: 16.1, newTotal: 8.2, unanswered: 0 });
  });
  it("U2a: an unanswered swap blocks Confirm; the total shows the swaps as offered until answered", () => {
    const s = substitutionState(U2B, 1.5, {});
    expect(s.unanswered).toBe(2);
    expect(s.newTotal).toBe(13.2);
  });
  it("the small-order fee comes back when the kept items fall under the minimum", () => {
    expect(substitutionState({ ...U2B, keptSubtotal: 2 }, 1.5, { bread: "remove", oil: "remove" }).newTotal).toBe(4.5);
  });
  it("lines: the struck price, the swap price and the ± pill", () => {
    const [bread, mazoe, oil] = substitutionLines(U2B);
    expect(bread).toMatchObject({ was: 1.1, now: 1.2, diff: 0.1, swapName: "Bakers Inn 700g" });
    expect(mazoe).toMatchObject({ was: 3.2, now: null, diff: -3.2, swapName: null });
    expect(oil!.diff).toBeCloseTo(0.2);
    const [reduce] = substitutionLines({ lines: [line({ action: "reduce", priceUsd: 2.5, quantity: 3, newQuantity: 1 })] });
    expect(reduce).toMatchObject({ was: 7.5, diff: -5 });
  });
  it("the 3-minute clock", () => {
    expect(roundClock(U2B, NOW)).toEqual({ leftMs: 161_000, pct: (161_000 / 180_000) * 100 });
    expect(roundClock(U2B, NOW + 999_999).leftMs).toBe(0);
  });
  it("U3 / U4b: what a resolved round took off", () => {
    const timedOut = { lines: U2B.lines.map((l) => (l.action === "swap" ? { ...l, answer: "remove" as const } : l)) };
    expect(roundTakenOff(timedOut)).toEqual({
      removed: ["Bread (Lobels 700g)", "Mazoe orange 2L", "Cooking oil 2L"],
      declinedSwaps: ["Bread (Lobels 700g)", "Cooking oil 2L"],
      reduced: [],
      saved: 9.1,
    });
    expect(roundTakenOff({ lines: [line({ action: "reduce", name: "Eggs", priceUsd: 0.5, quantity: 6, newQuantity: 2 })] })).toEqual({ removed: [], declinedSwaps: [], reduced: ["Eggs"], saved: 2 });
  });
});
