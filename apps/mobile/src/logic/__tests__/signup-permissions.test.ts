/**
 * Permissions right after sign-up (src/logic/signup-permissions.ts, ledger D-109): which screens a just-signed-in
 * account meets before its destination, once per install, skipping what the phone already allows.
 */
type P = Record<string, unknown>;
let mockLocGet: P;
let mockNotifGet: P;
let mockWeb = false;
const mockStore: Record<string, string> = {};
let mockStoreBroken = false;

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => mockLocGet,
  hasServicesEnabledAsync: async () => true,
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => mockNotifGet,
  getNotificationChannelAsync: async () => null,
  setNotificationChannelAsync: async () => null,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => {
    if (mockStoreBroken) throw new Error("keystore");
    return mockStore[k] ?? null;
  },
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
jest.mock("../../web-build", () => ({ isCustomerWebBuild: () => mockWeb }));

import { CUST_NOTIF_ASKS_SLOT, RIDER_PERM_FLOW_KEY, SIGNUP_PERMS_KEY } from "../../permissions/store";
import { afterSignIn, customerSignupSteps, signupNext } from "../signup-permissions";

const UNDET = { status: "undetermined", granted: false, canAskAgain: true };
const GRANTED = { status: "granted", granted: true, canAskAgain: true };
const DENIED = { status: "denied", granted: false, canAskAgain: true };
const BLOCKED = { status: "denied", granted: false, canAskAgain: false };

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockLocGet = UNDET;
  mockNotifGet = UNDET;
  mockWeb = false;
  mockStoreBroken = false;
});

describe("customerSignupSteps", () => {
  const opts = { web: false, notifAsksLeft: true };
  it("asks for both on a fresh phone", () => {
    expect(customerSignupSteps("undetermined", "undetermined", opts)).toEqual(["location", "notifications"]);
  });
  it("a location denied once can still be asked; a blocked one is left to Home's PC5", () => {
    expect(customerSignupSteps("denied", "granted", opts)).toEqual(["location"]);
    expect(customerSignupSteps("blocked", "granted", opts)).toEqual([]);
  });
  it("skips what the phone already allows", () => {
    expect(customerSignupSteps("granted", "undetermined", opts)).toEqual(["notifications"]);
    expect(customerSignupSteps("coarse", "granted", opts)).toEqual([]);
  });
  it("the web build has no push, so it asks for location only", () => {
    expect(customerSignupSteps("undetermined", "undetermined", { web: true, notifAsksLeft: true })).toEqual(["location"]);
  });
  it("no notification ask once PC8's cap is used up", () => {
    expect(customerSignupSteps("granted", "undetermined", { web: false, notifAsksLeft: false })).toEqual([]);
  });
});

describe("afterSignIn", () => {
  it("customer: the permission screens, then Home", async () => {
    await expect(afterSignIn("/home")).resolves.toBe("/setup-permissions?next=%2Fhome");
  });
  it("customer with everything allowed: straight to Home", async () => {
    mockLocGet = GRANTED;
    mockNotifGet = GRANTED;
    await expect(afterSignIn("/home")).resolves.toBe("/home");
  });
  it("customer on the web: location only", async () => {
    mockWeb = true;
    await expect(afterSignIn("/home")).resolves.toBe("/setup-permissions?next=%2Fhome");
    mockLocGet = GRANTED;
    await expect(afterSignIn("/home")).resolves.toBe("/home");
  });
  it("customer whose PC8 cap is used and location blocked: straight to Home", async () => {
    mockLocGet = BLOCKED;
    mockStore[CUST_NOTIF_ASKS_SLOT] = "3";
    await expect(afterSignIn("/home")).resolves.toBe("/home");
  });
  it("new rider: the rider steps, then R1", async () => {
    await expect(afterSignIn("/rider/become")).resolves.toBe("/permissions?from=signup&next=%2Frider%2Fbecome");
  });
  it("returning rider with a location denied once: the rider steps, then the board", async () => {
    mockLocGet = DENIED;
    mockNotifGet = GRANTED;
    await expect(afterSignIn("/rider")).resolves.toBe("/permissions?from=signup&next=%2Frider");
  });
  it("rider with everything allowed, or who already ran the rider flow on this phone: straight on", async () => {
    mockLocGet = GRANTED;
    mockNotifGet = GRANTED;
    await expect(afterSignIn("/rider")).resolves.toBe("/rider");
    mockLocGet = UNDET;
    mockStore[RIDER_PERM_FLOW_KEY] = "1";
    await expect(afterSignIn("/rider")).resolves.toBe("/rider");
  });
  it("once per install: after the screens have shown, every sign-in goes straight on", async () => {
    mockStore[SIGNUP_PERMS_KEY] = "1";
    await expect(afterSignIn("/home")).resolves.toBe("/home");
    await expect(afterSignIn("/rider/become")).resolves.toBe("/rider/become");
  });
  it("an unreadable store never puts the screens in front of every sign-in", async () => {
    mockStoreBroken = true;
    await expect(afterSignIn("/home")).resolves.toBe("/home");
  });
});

it("signupNext only hands over to Home or the rider side", () => {
  expect(signupNext("/rider/become", "/home")).toBe("/rider/become");
  expect(signupNext(["/rider"], "/home")).toBe("/rider");
  expect(signupNext("//evil.example", "/home")).toBe("/home");
  expect(signupNext("/order/1", "/rider")).toBe("/rider");
  expect(signupNext(undefined, "/home")).toBe("/home");
});
