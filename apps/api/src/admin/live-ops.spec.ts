import { RESTAURANTS_TIMING } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { breachOf, compareLive, LIVE_SLA_MS, LIVE_STAGES, type LiveOrderFacts, type LiveOrderExtras, PREP_GRACE_MS, slaTable, stageOf } from "./live-ops";

const T0 = new Date("2026-10-13T08:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

const facts = (over: Partial<LiveOrderFacts> = {}): LiveOrderFacts => ({
  orderType: "parcel",
  status: "open_for_offers",
  merchantPhase: null,
  createdAt: T0,
  riderId: null,
  assignedAt: null,
  merchantAcceptedAt: null,
  acceptDeadlineAt: null,
  autoAccepted: false,
  kitchenConfirmedAt: null,
  prepStartedAt: null,
  prepMinutes: null,
  dispatchStartedAt: null,
  readyAt: null,
  collectedAt: null,
  ...over,
});
const none: LiveOrderExtras = { bids: 0, firstBidAt: null, lastEventAt: null, assignedEventAt: null };

describe("live-ops stageOf", () => {
  it("a parcel with no bid is timed from creation; with bids, from the first bid", () => {
    expect(stageOf(facts(), none)).toEqual({ stage: "no_bid", startedAt: T0, limitMs: LIVE_SLA_MS.no_bid });
    expect(stageOf(facts(), { ...none, bids: 2, firstBidAt: at(1) })).toMatchObject({ stage: "choosing", startedAt: at(1) });
  });

  it("pickup runs from assignedAt, falling back to the assigned event", () => {
    expect(stageOf(facts({ status: "en_route_pickup", riderId: "r", assignedAt: at(2) }), none)).toMatchObject({ stage: "pickup", startedAt: at(2) });
    expect(stageOf(facts({ status: "assigned", riderId: "r" }), { ...none, assignedEventAt: at(3) })).toMatchObject({ stage: "pickup", startedAt: at(3) });
  });

  it("delivery runs from the order's last event", () => {
    const s = stageOf(facts({ status: "en_route_dropoff", riderId: "r", collectedAt: at(10) }), { ...none, lastEventAt: at(12) });
    expect(s).toMatchObject({ stage: "delivery", startedAt: at(12), limitMs: 20 * 60_000 });
  });

  it("a venue that hasn't accepted is timed from the ring; a scheduled order not yet rung isn't timed", () => {
    const ring = facts({ orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept", acceptDeadlineAt: at(3) });
    expect(stageOf(ring, none)).toMatchObject({ stage: "merchant_accept", startedAt: T0, limitMs: RESTAURANTS_TIMING.acceptWindowMs });
    expect(stageOf(facts({ orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept" }), none)).toBeNull();
  });

  it("an auto-accepted order the kitchen hasn't confirmed comes before the biker search", () => {
    const o = facts({ orderType: "merchant", status: "requested", merchantPhase: "preparing", autoAccepted: true, dispatchStartedAt: at(4) });
    expect(stageOf(o, none)?.stage).toBe("kitchen_confirm");
    expect(stageOf({ ...o, kitchenConfirmedAt: at(1) }, none)).toMatchObject({ stage: "no_biker", startedAt: at(4) });
  });

  it("cooking is timed against the venue's prep minutes plus grace", () => {
    const o = facts({ orderType: "merchant", status: "requested", merchantPhase: "preparing", prepStartedAt: at(1), prepMinutes: 15 });
    expect(stageOf(o, none)).toEqual({ stage: "preparing", startedAt: at(1), limitMs: 15 * 60_000 + PREP_GRACE_MS });
    expect(stageOf({ ...o, prepMinutes: null }, none)?.limitMs).toBe(LIVE_SLA_MS.preparing);
  });

  it("a ready food order with no biker is 'no biker' from readyAt; an open dispatch from its start", () => {
    expect(stageOf(facts({ orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", readyAt: at(5) }), none)).toMatchObject({
      stage: "no_biker",
      startedAt: at(5),
    });
    expect(stageOf(facts({ orderType: "merchant", status: "open_for_offers", dispatchStartedAt: at(6) }), none)).toMatchObject({
      stage: "no_biker",
      startedAt: at(6),
    });
  });

  it("waiting on the customer to pay or approve", () => {
    expect(stageOf(facts({ orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment", merchantAcceptedAt: at(2) }), none)).toMatchObject({
      stage: "customer",
      startedAt: at(2),
    });
  });

  it("does not time a delivered order", () => {
    expect(stageOf(facts({ status: "delivered" }), none)).toBeNull();
  });
});

describe("live-ops breach and sort", () => {
  it("warns at 75% of the limit and breaches at it", () => {
    expect(breachOf(0, 100)).toBe("ok");
    expect(breachOf(75, 100)).toBe("warn");
    expect(breachOf(100, 100)).toBe("breach");
  });

  it("sorts breach, then warn, then on time; the longest first inside each", () => {
    const rows = [
      { id: "a", breach: "ok" as const, elapsedMs: 900 },
      { id: "b", breach: "breach" as const, elapsedMs: 10 },
      { id: "c", breach: "warn" as const, elapsedMs: 5 },
      { id: "d", breach: "breach" as const, elapsedMs: 50 },
    ];
    expect(rows.sort(compareLive).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("the SLA table lists every stage once, in minutes", () => {
    const t = slaTable();
    expect(t.map((r) => r.stage)).toEqual([...LIVE_STAGES]);
    expect(t.find((r) => r.stage === "merchant_accept")?.limitMinutes).toBe(3);
    expect(t.find((r) => r.stage === "no_biker")?.limitMinutes).toBe(6);
  });
});
