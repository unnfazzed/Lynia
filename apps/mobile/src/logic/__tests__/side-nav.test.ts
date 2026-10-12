/**
 * Push and feed destinations open without stacking the two sides of the app (side-nav.ts): never a second
 * board over the rider tabs, never the board over customer Home, and a rider destination saves the side.
 */
const mockSaveRole = jest.fn(async (_r: string) => undefined);
jest.mock("../../auth/device-state", () => ({ saveRolePreference: (r: string) => mockSaveRole(r) }));

import { isRiderDestination, openDestination, tabsInHistory, type SideNav } from "../side-nav";
import { riderEntry } from "../sign-in-route";

function nav(): SideNav & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    push: (h) => calls.push(`push:${h}`),
    replace: (h) => calls.push(`replace:${h}`),
    dismissAll: () => calls.push("dismissAll"),
    dismissTo: (h) => calls.push(`dismissTo:${h}`),
  };
}

beforeEach(() => mockSaveRole.mockClear());

describe("openDestination", () => {
  it("a rider tab with the rider tabs in the history: dismissed back to, never pushed again", () => {
    const r = nav();
    openDestination(r, { pathname: "/rider/job", riderTabsBelow: true }, "/rider");
    expect(r.calls).toEqual(["dismissTo:/rider"]);
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
  });

  it("a rider tab from the customer side: the customer stack is cleared and replaced, the side saved", () => {
    const r = nav();
    openDestination(r, { pathname: "/home", riderTabsBelow: false, customerTabsBelow: true }, "/rider/money");
    expect(r.calls).toEqual(["dismissAll", "replace:/rider/money"]);
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
  });

  it("a rider screen above the tabs: pushed over the rider tabs, which are put in place first from the customer side", () => {
    const onRider = nav();
    openDestination(onRider, { pathname: "/rider", riderTabsBelow: true }, "/rider/food-offer?orderId=o1");
    expect(onRider.calls).toEqual(["push:/rider/food-offer?orderId=o1"]);
    const onCustomer = nav();
    openDestination(onCustomer, { pathname: "/home", riderTabsBelow: false }, "/rider/job");
    expect(onCustomer.calls).toEqual(["dismissAll", "replace:/rider", "push:/rider/job"]);
  });

  it("already on the target: nothing", () => {
    const r = nav();
    openDestination(r, { pathname: "/rider", riderTabsBelow: true }, "/rider");
    expect(r.calls).toEqual([]);
    expect(mockSaveRole).not.toHaveBeenCalled();
  });

  it("customer destinations are pushed as before; Home with the customer tabs below is dismissed back to", () => {
    const r = nav();
    openDestination(r, { pathname: "/notifications", riderTabsBelow: false, customerTabsBelow: true }, "/order/o1");
    openDestination(r, { pathname: "/notifications", riderTabsBelow: false, customerTabsBelow: true }, "/home");
    expect(r.calls).toEqual(["push:/order/o1", "dismissTo:/home"]);
    expect(mockSaveRole).not.toHaveBeenCalled();
  });
});

describe("tabsInHistory / isRiderDestination", () => {
  it("reads the tab shells from the root stack's route names", () => {
    expect(tabsInHistory({ routes: [{ name: "rider/(tabs)" }, { name: "rider/job" }] })).toEqual({ riderTabsBelow: true, customerTabsBelow: false });
    expect(tabsInHistory({ routes: [{ name: "(tabs)" }, { name: "order/[id]" }] })).toEqual({ riderTabsBelow: false, customerTabsBelow: true });
    expect(tabsInHistory(undefined)).toEqual({ riderTabsBelow: false, customerTabsBelow: false });
  });

  it("only /rider… is the rider side", () => {
    expect(isRiderDestination("/rider")).toBe(true);
    expect(isRiderDestination("/rider/job")).toBe(true);
    expect(isRiderDestination("/rider?x=1")).toBe(true);
    expect(isRiderDestination("/riders")).toBe(false);
    expect(isRiderDestination("/order/o1")).toBe(false);
  });
});

describe("riderEntry (sign-in → rider side)", () => {
  it("an account with no rider record goes straight to R1; a rider to the board; a customer home", () => {
    expect(riderEntry("/rider", false)).toBe("/rider/become");
    expect(riderEntry("/rider", true)).toBe("/rider");
    expect(riderEntry("/home", false)).toBe("/home");
  });
});
