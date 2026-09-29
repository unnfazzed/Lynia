import { describe, expect, it } from "vitest";
import { merchantProfile } from "../testing/fixtures";
import { buildSetupState, buildShopSetupState } from "./setup-checklist";

describe("buildShopSetupState (merchant web upgrade L1, live steps from L2)", () => {
  it("on an API that can't book riders yet: ticks the pin, tags booking as coming soon, and asks for items", () => {
    const setup = buildShopSetupState();
    expect(setup.items.map((i) => [i.key, i.done, !!i.soon])).toEqual([
      ["pin", true, false],
      ["first_booking", false, true],
      ["items", false, false],
    ]);
    expect(setup.items.find((i) => i.key === "first_booking")?.action).toBeUndefined();
    expect(setup.items.find((i) => i.key === "items")?.action).toEqual({ label: "Add items", href: "/menu" });
    // Only real work counts: the coming-soon step never does.
    expect(setup.remaining).toBe(1);
  });

  it("once bookings are on, booking a rider is live work that goes to the booking form", () => {
    const setup = buildShopSetupState({ bookingsOn: true, bookings: 0, items: 0 });
    const booking = setup.items.find((i) => i.key === "first_booking")!;
    expect(booking.soon).toBeFalsy();
    expect(booking.done).toBe(false);
    expect(booking.action).toEqual({ label: "Book a rider", href: "/deliveries/new" });
    expect(setup.remaining).toBe(2);
  });

  it("ticks booking with the first booking and items with the first item", () => {
    const setup = buildShopSetupState({ bookingsOn: true, bookings: 3, items: 1 });
    expect(setup.items.every((i) => i.done)).toBe(true);
    expect(setup.items.find((i) => i.key === "first_booking")?.action).toEqual({ label: "See deliveries", href: "/deliveries" });
    expect(setup.items.find((i) => i.key === "items")?.detail).toBe("1 item added. Customers will see them when LyniaGo Shops opens.");
    expect(setup.remaining).toBe(0);
  });

  it("is never live: customers find shops when LyniaGo Shops opens", () => {
    expect(buildShopSetupState().live).toBe(false);
    expect(buildShopSetupState({ bookingsOn: true, bookings: 5, items: 9 }).live).toBe(false);
  });
});

describe("buildSetupState (restaurants, unchanged)", () => {
  it("still counts the menu, hours and alarm, and reads live straight off pilotEnabled", () => {
    const setup = buildSetupState({ profile: merchantProfile({ pilotEnabled: true }), dishes: [], alarmTested: false });
    expect(setup.items.map((i) => i.key)).toEqual(["menu", "hours", "payment", "alarm"]);
    expect(setup.remaining).toBe(3);
    expect(setup.live).toBe(true);
  });
});
