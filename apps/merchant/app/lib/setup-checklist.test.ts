import { describe, expect, it } from "vitest";
import { merchantProfile } from "../testing/fixtures";
import { buildSetupState, buildShopSetupState } from "./setup-checklist";

describe("buildShopSetupState (merchant web upgrade L1)", () => {
  it("ticks the pin (set at sign-up) and shows the later layers' steps as coming soon, never as work", () => {
    const setup = buildShopSetupState();
    expect(setup.items.map((i) => [i.key, i.done, !!i.soon])).toEqual([
      ["pin", true, false],
      ["first_booking", false, true],
      ["items", false, true],
    ]);
    expect(setup.items.every((i) => !i.action)).toBe(true);
    expect(setup.remaining).toBe(0);
  });

  it("is never live: customers find shops when LyniaGo Shops opens", () => {
    expect(buildShopSetupState().live).toBe(false);
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
