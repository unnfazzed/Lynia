import { describe, expect, it } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import { merchantOrder, merchantProfile, RIDER } from "../testing/fixtures";
import { detailView, homeSections, itemsLine, openStatus, orderLabel, rowSub, steps } from "./orders-view";

const o = merchantOrder;

describe("the Orders home's lists (merchant mobile B1, D-48)", () => {
  it("puts ringing and undecided orders under New, cooking under Cooking, waiting-for-rider under Ready, and picked-up ones out for delivery", () => {
    const orders = [
      o({ id: "a0000001-0000-4000-8000-000000000000" }),
      o({ id: "a0000002-0000-4000-8000-000000000000", merchantPhase: "awaiting_payment", paymentMethod: "wallet" }),
      o({ id: "a0000003-0000-4000-8000-000000000000", merchantPhase: "preparing" }),
      o({ id: "a0000004-0000-4000-8000-000000000000", merchantPhase: "ready_for_pickup", status: "open_for_offers" }),
      o({ id: "a0000005-0000-4000-8000-000000000000", merchantPhase: null, status: "en_route_dropoff", debtStatus: "open" }),
      o({ id: "a0000006-0000-4000-8000-000000000000", merchantPhase: null, status: "delivered", debtStatus: "open", merchantClosedAt: "2026-09-30T13:00:00Z" }),
    ];
    const s = homeSections(orders);
    expect(s.new.map((x) => x.id.slice(0, 8))).toEqual(["a0000001", "a0000002"]);
    expect(s.cooking.map((x) => x.id.slice(0, 8))).toEqual(["a0000003"]);
    expect(s.ready.map((x) => x.id.slice(0, 8))).toEqual(["a0000004"]);
    // Closed by the merchant (no cash / mark completed) drops off the home.
    expect(s.outForDelivery.map((x) => x.id.slice(0, 8))).toEqual(["a0000005"]);
  });

  it("labels orders the way the handoff draws them", () => {
    expect(orderLabel(o({ id: "a111ffff-0000-4000-8000-000000000000" }))).toBe("#A111");
    expect(itemsLine(o({ items: [{ dishId: "d", name: "Mazondo", priceUsd: 5, quantity: 2, note: null, available: null }] }))).toBe("2× Mazondo");
  });

  it("says where a waiting or delivered order stands", () => {
    expect(rowSub(o({ merchantPhase: "preparing", prepMinutes: null }))).toBe("Cooking");
    expect(rowSub(o({ merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: new Date(2026, 8, 30, 12, 0).toISOString() }))).toBe("Cooking · ready by 12:15");
    expect(rowSub(o({ merchantPhase: "ready_for_pickup", status: "open_for_offers" }))).toBe("Finding a rider");
    expect(rowSub(o({ merchantPhase: "ready_for_pickup", status: "open_for_offers", noRiderHoldAt: "2026-09-30T12:20:00Z" }))).toBe("No rider yet · decide what to do");
    expect(rowSub(o({ merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }))).toBe("Blessing M. coming to your counter");
    expect(rowSub(o({ merchantPhase: null, status: "en_route_dropoff", debtStatus: "open", debtAmount: 12 }))).toBe("On the way · cash back $12.00");
    expect(rowSub(o({ merchantPhase: null, status: "delivered", debtStatus: "open", debtAmount: 12 }))).toBe("Delivered · cash back $12.00");
  });
});

describe("which screen an order opens on", () => {
  it("B3 cooking, B4 handover (until and just after pickup), B6 tracking, B7 delivered with cash back, else closed", () => {
    expect(detailView(o())).toBe("ringing");
    expect(detailView(o({ merchantPhase: "awaiting_payment" }))).toBe("legacy");
    expect(detailView(o({ merchantPhase: "preparing" }))).toBe("cooking");
    expect(detailView(o({ merchantPhase: "ready_for_pickup", status: "open_for_offers" }))).toBe("handover");
    expect(detailView(o({ merchantPhase: null, status: "en_route_pickup", riderId: RIDER.profileId }))).toBe("handover");
    expect(detailView(o({ merchantPhase: null, status: "en_route_dropoff" }))).toBe("tracking");
    expect(detailView(o({ merchantPhase: null, status: "delivered", debtStatus: "open" }))).toBe("delivered");
    expect(detailView(o({ merchantPhase: null, status: "undelivered", debtStatus: "open" }))).toBe("delivered");
    expect(detailView(o({ merchantPhase: null, status: "delivered", debtStatus: "settled_cash" }))).toBe("closed");
    expect(detailView(o({ merchantPhase: null, status: "delivered", debtStatus: "open", merchantClosedAt: "2026-09-30T13:00:00Z" }))).toBe("closed");
    expect(detailView(o({ merchantPhase: null, status: "cancelled" }))).toBe("closed");
  });
});

describe("the tracking stepper (B6)", () => {
  it("is the eight steps, done with their times, the current one live, the rest to come", () => {
    const order = o({
      merchantPhase: null,
      status: "en_route_dropoff",
      riderId: RIDER.profileId,
      prepStartedAt: "2026-09-30T12:04:30.000Z",
      debtStatus: "open",
      timeline: [
        { status: "requested", at: "2026-09-30T12:04:00.000Z" },
        { status: "assigned", at: "2026-09-30T12:15:00.000Z" },
        { status: "picked_up", at: "2026-09-30T12:18:00.000Z" },
        { status: "en_route_dropoff", at: "2026-09-30T12:19:00.000Z" },
      ],
    });
    const s = steps(order);
    expect(s.map((x) => x.label)).toEqual([
      "Order placed",
      "You accepted",
      "Rider secured",
      "Rider at your counter",
      "Picked up",
      "On the way",
      "Delivered",
      "Cash back to you",
    ]);
    expect(s.map((x) => x.state)).toEqual(["done", "done", "done", "done", "done", "done", "now", "todo"]);
    expect(s[6]!.time).toBe("live");
    expect(s[7]!.time).toBe("");
    expect(s[0]!.time).toMatch(/^\d\d:\d\d$/);
  });

  it("completes the last step once the cash is counted or the merchant closed without it", () => {
    const delivered = { merchantPhase: null, status: "delivered", riderId: RIDER.profileId, prepStartedAt: "2026-09-30T12:04:00Z" } as const;
    expect(steps(o({ ...delivered, debtStatus: "settled_cash" })).every((x) => x.state === "done")).toBe(true);
    expect(steps(o({ ...delivered, debtStatus: "open" })).at(-1)!.state).toBe("now");
    expect(steps(o({ ...delivered, debtStatus: "open", merchantClosedAt: "2026-09-30T13:00:00Z" })).at(-1)!.state).toBe("done");
  });
});

describe("the header's open/closed line and switch (B1/B5)", () => {
  const WED_NOON = new Date(2026, 8, 30, 12, 0); // a Wednesday
  // Only Wednesday and Thursday: an absent day means closed that day.
  const hours = { wed: { open: "08:00", close: "22:00" }, thu: { open: "08:00", close: "22:00" } } as MerchantProfileResponse["hours"];

  it("open inside hours", () => {
    expect(openStatus(merchantProfile({ hours }), WED_NOON)).toEqual({ open: true, closedByHand: false, label: "Open until 22:00" });
  });

  it("closed by hand says when it opens next", () => {
    const closedUntil = new Date(2026, 9, 1, 0, 0).toISOString();
    expect(openStatus(merchantProfile({ hours, closedUntil }), WED_NOON)).toEqual({ open: false, closedByHand: true, label: "Closed · opens 08:00" });
  });

  it("outside hours reads closed without being closed by hand", () => {
    expect(openStatus(merchantProfile({ hours }), new Date(2026, 8, 30, 6, 0))).toEqual({ open: false, closedByHand: false, label: "Closed · opens 08:00" });
  });

  it("a restaurant with no hours set is open, and a close that has passed doesn't count", () => {
    expect(openStatus(merchantProfile({ hours: null }), WED_NOON).open).toBe(true);
    expect(openStatus(merchantProfile({ hours, closedUntil: new Date(2026, 8, 30, 11, 0).toISOString() }), WED_NOON).open).toBe(true);
  });
});
