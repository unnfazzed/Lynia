import { describe, expect, it } from "vitest";
import { bookingSteps, fareDelta, shortName, sortOffers, tracker, trackedBookings } from "./booking-view";
import { merchantBooking } from "../testing/fixtures";

describe("D1 trackers", () => {
  it("names riders as the handoff does", () => {
    expect(shortName("Blessing Moyo")).toBe("Blessing M.");
    expect(shortName("Farai")).toBe("Farai");
    expect(shortName(null)).toBeNull();
  });

  it("reads finding, coming, picked up and ended bookings", () => {
    expect(tracker(merchantBooking({ state: "finding", itemsSummary: "Car battery", offerCount: 3 }))).toMatchObject({ icon: "timer", title: "Car battery · 3 offers", sub: "Pick a rider" });
    expect(tracker(merchantBooking({ state: "finding", itemsSummary: "Car battery", offerCount: 0 })).sub).toBe("Waiting for offers");
    const rider = { name: "Blessing Moyo", phone: null, bikeReg: null };
    expect(tracker(merchantBooking({ state: "coming", itemsSummary: "Brake pads", rider }))).toMatchObject({ title: "Brake pads · Blessing M.", progress: 2 });
    expect(tracker(merchantBooking({ state: "picked_up", itemsSummary: "Brake pads", rider })).progress).toBe(4);
    expect(tracker(merchantBooking({ state: "delivered", itemsSummary: "Brake pads", rider }))).toMatchObject({ icon: "circle-check", sub: "Delivered" });
  });

  it("keeps live bookings and the last day's, not re-sent ones", () => {
    const now = Date.now();
    const old = new Date(now - 2 * 86_400_000).toISOString();
    const kept = trackedBookings(
      [
        merchantBooking({ id: "a", state: "coming", createdAt: old }),
        merchantBooking({ id: "b", state: "delivered", createdAt: old }),
        merchantBooking({ id: "c", state: "delivered", createdAt: new Date(now - 3600_000).toISOString() }),
        merchantBooking({ id: "d", state: "cancelled", rebroadcastedToId: "a" }),
      ],
      now,
    );
    expect(kept.map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("D4 offers", () => {
  const offer = (id: string, fare: string, eta: number, over = {}) => ({
    id,
    type: "counter" as const,
    offeredFare: fare,
    etaMinutes: eta,
    rider: { name: id, photoUrl: null, ratingAvg: 4.5, ratingCount: 10, tripsCount: 50 },
    preferred: false,
    ownMember: false,
    ...over,
  });
  const offers = [offer("Kuda", "3.80", 4), offer("Tendai", "5.00", 3), offer("Farai", "4.20", 6, { preferred: true }), offer("Staff", "1.00", 1, { ownMember: true })];

  it("sorts by best match (own riders on top), cheapest and closest, a teammate always last", () => {
    expect(sortOffers(offers, "best")[0]!.id).toBe("Farai");
    expect(sortOffers(offers, "cheapest").map((o) => o.id)).toEqual(["Kuda", "Farai", "Tendai", "Staff"]);
    expect(sortOffers(offers, "closest").map((o) => o.id)).toEqual(["Tendai", "Kuda", "Farai", "Staff"]);
  });

  it("says how a counter-offer compares with the fare offered", () => {
    expect(fareDelta("3.80", "4.20")).toEqual({ text: "$0.40 less", less: true });
    expect(fareDelta("5.00", "4.20")).toEqual({ text: "$0.80 more", less: false });
    expect(fareDelta("4.20", "4.20")).toBeNull();
  });
});

describe("D5 stepper", () => {
  it("ticks what's done and marks the current step live", () => {
    const at = new Date(2026, 8, 30, 12, 10).toISOString();
    const coming = bookingSteps({ state: "coming", createdAt: at });
    expect(coming.map((s) => s.state)).toEqual(["done", "done", "now", "todo", "todo", "todo"]);
    expect(coming[0]!.time).toBe("12:10");
    expect(coming[2]!.time).toBe("live");
    expect(bookingSteps({ state: "delivered", createdAt: at }).every((s) => s.state === "done")).toBe(true);
  });
});
