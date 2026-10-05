import { describe, expect, it } from "vitest";
import { merchantBooking, merchantOrder, RIDER } from "../testing/fixtures";
import { boardItems, buildBoard } from "./board";
import { vocabulary } from "./vocabulary";

const NOW = new Date("2026-10-04T07:20:00").getTime();
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
const kitchen = vocabulary("restaurant");
const shopV = vocabulary("shop", "grocery");

describe("the Orders board (Merchant v2 K1/S1, D-77)", () => {
  it("names one line with its quantity and several by name", () => {
    expect(boardItems({ items: [{ dishId: "d", name: "Mazondo", priceUsd: 5, quantity: 1, note: null, available: null }] })).toBe("1× Mazondo");
    expect(
      boardItems({
        items: [
          { dishId: "d", name: "Mazondo", priceUsd: 5, quantity: 1, note: null, available: null },
          { dishId: "e", name: "Sadza & greens", priceUsd: 4.5, quantity: 1, note: null, available: null },
        ],
      }),
    ).toBe("Mazondo & Sadza & greens");
  });

  it("sorts needs-you, then cooking by ready time, then on the way, then cash still to come back", () => {
    const sections = buildBoard({
      v: kitchen,
      shop: false,
      now: NOW,
      orders: [
        merchantOrder({ id: "a2230000-0000-4000-8000-000000000000", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: at(-2) }),
        merchantOrder({
          id: "a2220000-0000-4000-8000-000000000000",
          merchantPhase: "preparing",
          prepMinutes: 15,
          prepStartedAt: at(-7),
          riderId: RIDER.profileId,
        }),
        merchantOrder({ id: "a4440000-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }),
        merchantOrder({
          id: "a1110000-0000-4000-8000-000000000000",
          merchantPhase: null,
          status: "en_route_dropoff",
          rider: RIDER,
          riderId: RIDER.profileId,
          debtStatus: "open",
          debtAmount: 12,
        }),
        merchantOrder({
          id: "a0980000-0000-4000-8000-000000000000",
          merchantPhase: null,
          status: "delivered",
          rider: RIDER,
          riderId: RIDER.profileId,
          debtStatus: "open",
          debtAmount: 9.5,
          cashDueAt: at(-5),
        }),
      ],
    });
    expect(sections.map((s) => s.heading)).toEqual(["NEEDS YOU", "COOKING · 2", "ON THE WAY · 1", "CASH TO COME BACK · 1"]);
    expect(sections[0]!.cards[0]).toMatchObject({ counter: true, title: `${RIDER.firstName} M. is coming to your counter` });
    const [first, second] = sections[1]!.cards;
    expect(first).toMatchObject({ title: "#A222 · 2× Sadza & beef stew", right: "8 min", sub: "Ready 07:28 · rider booked" });
    expect(second).toMatchObject({ right: "13 min", sub: "Ready 07:33" });
    expect(sections[2]!.cards[0]).toMatchObject({ title: "#A111 · Blessing M.", sub: "On the way · then brings you $12.00" });
    expect(sections[3]!.cards[0]).toMatchObject({ urgent: true, subTone: "gold", sub: "$9.50 was due 07:15" });
  });

  it("once the rider's location says so: 'at your counter', and the on-the-way arrival time (D-77)", () => {
    const sections = buildBoard({
      v: kitchen,
      shop: false,
      now: NOW,
      orders: [
        merchantOrder({ id: "a4440000-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, riderArrivedAt: at(-1) }),
        merchantOrder({
          id: "a1110000-0000-4000-8000-000000000000",
          merchantPhase: null,
          status: "en_route_dropoff",
          rider: RIDER,
          riderId: RIDER.profileId,
          debtStatus: "open",
          debtAmount: 12,
          riderEtaAt: at(18),
        }),
      ],
    });
    expect(sections[0]!.cards[0]).toMatchObject({ counter: true, title: `${RIDER.firstName} M. is at your counter` });
    expect(sections[1]!.cards[0]).toMatchObject({ sub: "Arrives 07:38 · then brings you $12.00" });
  });

  it("a shop's board says PACKING, tags its app orders and lists its own bookings as BOOKED", () => {
    const sections = buildBoard({
      v: shopV,
      shop: true,
      now: NOW,
      orders: [
        merchantOrder({
          id: "a1b20000-0000-4000-8000-000000000000",
          merchantPhase: "awaiting_item_approval",
          customerFirstName: "Rudo",
          itemApprovalDeadlineAt: at(2.5),
        }),
        merchantOrder({ id: "a3330000-0000-4000-8000-000000000000", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: at(-2) }),
      ],
      bookings: [
        merchantBooking({ id: "live", state: "finding", itemsSummary: "Car battery", offerCount: 3, expiresAt: at(1) }),
        merchantBooking({
          id: "gone",
          state: "picked_up",
          itemsSummary: "Brake pads",
          rider: { name: "Blessing Moyo", phone: null, bikeReg: "AFG 2231" },
          cashOnDelivery: { amount: "51.00", status: "awaiting_delivery", dueAt: at(30) },
        }),
      ],
    });
    expect(sections.map((s) => s.heading)).toEqual(["NEEDS YOU", "PACKING · 1", "ON THE WAY · 1"]);
    expect(sections[0]!.cards.map((c) => c.title)).toEqual(["Car battery · 3 riders offered", "#A1B2 · Rudo asked for 1 item"]);
    expect(sections[0]!.cards[1]).toMatchObject({ tag: "APP", sub: "Waiting for Rudo’s OK", subDeadline: at(2.5) });
    expect(sections[1]!.cards[0]!.tag).toBe("APP");
    expect(sections[2]!.cards[0]).toMatchObject({ tag: "BOOKED", title: "Brake pads · Blessing M.", bar: { steps: 4 }, sub: "Brings you $51.00 by 07:50" });
  });

  it("without a first name, the customer is 'the customer'", () => {
    const [needs] = buildBoard({ v: shopV, shop: true, now: NOW, orders: [merchantOrder({ merchantPhase: "awaiting_item_approval" })] });
    expect(needs!.cards[0]).toMatchObject({ title: "#A111 · The customer asked for 1 item", sub: "Waiting for the customer’s OK" });
  });
});
