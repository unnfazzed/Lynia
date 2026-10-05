import { describe, expect, it } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import { merchantOrder, merchantProfile, RIDER } from "../testing/fixtures";
import { detailView, homeSections, itemsEditedLabel, itemsLine, liveBar, openStatus, orderLabel, rowSub, trackStep, cashBackRow, groupCode } from "./orders-view";
import { alarmOrders } from "./alarm";

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
    // D-74: a wallet order placed before cash-only waits on its own payment ticket, not the old card.
    expect(detailView(o({ merchantPhase: "awaiting_payment", paymentMethod: "wallet" }))).toBe("payment");
    // M2 holds every order waiting on the customer: a v2 round, or a shortened order sent before v2.
    expect(detailView(o({ merchantPhase: "awaiting_item_approval" }))).toBe("cooking");
    expect(detailView(o({ merchantPhase: "preparing" }))).toBe("cooking");
    // M1a: an auto-accepted order the kitchen hasn't confirmed rings on the Orders home.
    expect(detailView(o({ merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null }))).toBe("ringing");
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

describe("the merchant track (Order flow v2 M3–M6, D-59)", () => {
  it("is the customer's four steps: confirmed, cooking until the rider has it, on the way, then all done", () => {
    expect(trackStep(o())).toBe(0);
    expect(trackStep(o({ merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null }))).toBe(0);
    expect(trackStep(o({ merchantPhase: "preparing" }))).toBe(1);
    expect(trackStep(o({ merchantPhase: "ready_for_pickup", status: "open_for_offers" }))).toBe(1);
    expect(trackStep(o({ merchantPhase: null, status: "en_route_pickup", riderId: RIDER.profileId }))).toBe(1);
    expect(trackStep(o({ merchantPhase: null, status: "picked_up" }))).toBe(2);
    expect(trackStep(o({ merchantPhase: null, status: "en_route_dropoff" }))).toBe(2);
    expect(trackStep(o({ merchantPhase: null, status: "delivered" }))).toBe(4);
  });

  it("adds 'Cash back to you' only when the rider brings the money back: after delivery, then due, then done", () => {
    const cash = { paymentMethod: "cash", merchantCashRule: "collect_and_return", merchantPhase: null } as const;
    expect(cashBackRow(o({ ...cash, status: "en_route_dropoff", debtStatus: "open" }))).toEqual({ state: "after", dueAt: null });
    const due = new Date(2026, 9, 2, 13, 17).toISOString();
    expect(cashBackRow(o({ ...cash, status: "delivered", debtStatus: "open", cashDueAt: due }))).toEqual({ state: "due", dueAt: "13:17" });
    expect(cashBackRow(o({ ...cash, status: "delivered", debtStatus: "settled_cash" }))!.state).toBe("done");
    expect(cashBackRow(o({ ...cash, merchantCashRule: "pay_upfront", status: "en_route_dropoff" }))).toBeNull();
    expect(cashBackRow(o({ ...cash, paymentMethod: "wallet", status: "en_route_dropoff" }))).toBeNull();
  });

  it("groups a six-digit code 3+3 and leaves a legacy four-digit one whole", () => {
    expect(groupCode("731604")).toEqual(["731", "604"]);
    expect(groupCode("7316")).toEqual(["7316"]);
  });
});

describe("the header's open/closed line and switch (B1/B5)", () => {
  const WED_NOON = new Date(2026, 8, 30, 12, 0); // a Wednesday
  // Only Wednesday and Thursday: an absent day means closed that day.
  const hours = { wed: { open: "08:00", close: "22:00" }, thu: { open: "08:00", close: "22:00" } } as MerchantProfileResponse["hours"];

  it("open inside hours", () => {
    expect(openStatus(merchantProfile({ hours }), WED_NOON)).toEqual({ open: true, closedByHand: false, label: "Open · until 22:00" });
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

describe("auto-accept on the Orders home", () => {
  const unconfirmed = o({ id: "c0000001-0000-4000-8000-000000000000", merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null });
  const confirmed = o({ id: "c0000002-0000-4000-8000-000000000000", merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: "2026-09-30T12:00:00Z" });

  it("an order waiting for the kitchen to confirm is New work, not Cooking", () => {
    const s = homeSections([unconfirmed, confirmed]);
    expect(s.new.map((x) => x.id.slice(0, 8))).toEqual(["c0000001"]);
    expect(s.cooking.map((x) => x.id.slice(0, 8))).toEqual(["c0000002"]);
    expect(rowSub(unconfirmed)).toBe("Waiting for you to confirm");
  });

  it("the alarm rings for it too, and stops once it's confirmed", () => {
    expect(alarmOrders([unconfirmed, confirmed]).map((x) => x.id.slice(0, 8))).toEqual(["c0000001"]);
  });

  it("says when the items were changed", () => {
    expect(itemsEditedLabel(o({ itemsEditedAt: new Date(2026, 8, 30, 12, 10).toISOString() }))).toBe("Items changed 12:10");
    expect(itemsEditedLabel(o({}))).toBeNull();
  });
});

describe("T1's live bar (Merchant v2, D-77)", () => {
  const cooking = (id: string) => o({ id, merchantPhase: "preparing", status: "requested" });
  const onTheWay = o({ id: "a0000009-0000-4000-8000-000000000000", merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER });

  it("is hidden when nothing is live", () => {
    expect(liveBar([], "Cooking")).toBeNull();
  });

  it("leads with a rider heading to the counter, and counts the rest", () => {
    const counter = o({ id: "a0000004-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER });
    const view = liveBar([counter, cooking("a0000001-0000-4000-8000-000000000000"), cooking("a0000002-0000-4000-8000-000000000000"), onTheWay], "Cooking");
    expect(view).toEqual({
      title: `${RIDER.firstName} is coming to your counter`,
      sub: "2 cooking · 1 ready · 1 on the way",
      href: "/queue/a0000004-0000-4000-8000-000000000000",
    });
  });

  it("says the rider is at the counter once they've arrived (D-77)", () => {
    const counter = o({ id: "a0000004-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, riderArrivedAt: "2026-10-05T07:00:00.000Z" });
    expect(liveBar([counter], "Cooking")?.title).toBe(`${RIDER.firstName} is at your counter`);
  });

  it("a ringing order comes first and opens the Orders home", () => {
    const view = liveBar([o({ id: "a1b20000-0000-4000-8000-000000000000" }), cooking("a0000001-0000-4000-8000-000000000000")], "Packing");
    expect(view).toEqual({ title: "New order · #A1B2", sub: "1 packing", href: "/queue" });
  });

  it("with nothing that needs the merchant, the counts are the line", () => {
    expect(liveBar([cooking("a0000001-0000-4000-8000-000000000000"), onTheWay], "Cooking")).toEqual({
      title: "1 cooking · 1 on the way",
      sub: null,
      href: "/queue/a0000001-0000-4000-8000-000000000000",
    });
  });
});
