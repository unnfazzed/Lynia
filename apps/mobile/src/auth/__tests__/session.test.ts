/**
 * BH-17 regression guard: clearDeviceState() must wipe EVERY per-session/per-order draft key on
 * sign-out, or a shared device's next user rehydrates the previous user's state. Mocks expo-secure-store
 * directly (jest-expo has no built-in behavior for it) so we can assert on exactly which keys get deleted.
 */
const mockDeleteItemAsync = jest.fn().mockResolvedValue(undefined);
const mockGetItemAsync = jest.fn().mockResolvedValue(null);
const mockSetItemAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

import { HISTORY_SNAPSHOT_KEY } from "../../net/history-store";
import { RECENTS_KEY as SAVED_PLACES_RECENTS_KEY, SAVED_KEY as SAVED_PLACES_SAVED_KEY } from "../../logic/saved-places";
import { MY_PICKUP_PHONE_KEY, RECIPIENTS_KEY } from "../../logic/saved-recipients";
import { KYC_DRAFT_KEY } from "../../logic/kyc-draft";
import { RIDER_IDENTITY_KEY } from "../../logic/rider-identity";
import { JOB_KEY } from "../../net/last-active-store";
import { PICKUP_CHECKLIST_DRAFT_KEY } from "../../logic/pickup-checklist-draft";
import { RIDER_BID_DRAFT_KEY, RIDER_SENT_OFFERS_KEY } from "../../logic/rider-bid-draft";
import { RESTAURANT_LIST_SNAPSHOT_KEY } from "../../net/restaurant-list-store";
import { FOOD_CART_SNAPSHOT_KEY } from "../../net/food-cart-store";
import { clearDeviceState, loadSession } from "../session";

afterEach(() => {
  mockDeleteItemAsync.mockClear();
  mockGetItemAsync.mockReset().mockResolvedValue(null);
});

describe("clearDeviceState (sign-out wipe, BH-17)", () => {
  it("deletes the pickup-checklist draft key — the only per-order draft this wipe previously missed", async () => {
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toContain(PICKUP_CHECKLIST_DRAFT_KEY);
  });

  // BH-23: RIDER_SENT_OFFERS_KEY (added by BH-21, after this wipe was last touched) was never added to
  // the delete list — a signed-out rider's already-sent bids on other open orders survived and rehydrated
  // for the next rider on a shared device, painting their fare/eta as the new rider's own pending offers.
  it("deletes the rider sent-offers key — BH-21's persistence added after this wipe was last updated", async () => {
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toContain(RIDER_SENT_OFFERS_KEY);
  });
});

// RF-10 characterization (pin current behavior before extracting the non-auth SecureStore groups into
// device-state.ts): clearDeviceState() must keep wiping exactly this key set, including the "oddities" —
// the device id, onboarding-seen, and permissions-primed flags are install-level and deliberately survive
// sign-out, and the session token itself is cleared separately by clearSession().
describe("clearDeviceState (full key-wipe characterization, RF-10 pin)", () => {
  it("wipes every non-order-scoped key clearDeviceState is documented to own", async () => {
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        "lynia.orderDraft",
        "lynia.disclaimerAccepted",
        "lynia.rolePreference",
        "lynia.deliveryCode.index",
        "lynia.handbackAck",
        "lynia.confirmItemsPending",
        "lynia.riderJobTerminal",
        "lynia.pendingRating",
        "lynia.pendingSenderRating",
        "lynia.pendingTopup",
        SAVED_PLACES_RECENTS_KEY,
        SAVED_PLACES_SAVED_KEY,
        RECIPIENTS_KEY,
        MY_PICKUP_PHONE_KEY,
        KYC_DRAFT_KEY,
        HISTORY_SNAPSHOT_KEY,
        RIDER_IDENTITY_KEY,
        JOB_KEY,
        RIDER_BID_DRAFT_KEY,
        RIDER_SENT_OFFERS_KEY,
        PICKUP_CHECKLIST_DRAFT_KEY,
        RESTAURANT_LIST_SNAPSHOT_KEY,
        FOOD_CART_SNAPSHOT_KEY,
      ]),
    );
  });

  it("wipes each indexed per-order delivery-code key (code + attempts high-water + rotation baseline)", async () => {
    mockGetItemAsync.mockImplementation(async (key: string) =>
      key === "lynia.deliveryCode.index" ? JSON.stringify(["order-1", "order-2"]) : null,
    );
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    for (const orderId of ["order-1", "order-2"]) {
      expect(deletedKeys).toContain(`lynia.deliveryCode.${orderId}`);
      expect(deletedKeys).toContain(`lynia.deliveryCodeAttempts.${orderId}`);
      expect(deletedKeys).toContain(`lynia.deliveryCodeRotatedAt.${orderId}`);
    }
  });

  it("does NOT wipe the device id, onboarding-seen, permissions-primed, or session keys", async () => {
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    expect(deletedKeys).not.toContain("lynia.deviceId");
    expect(deletedKeys).not.toContain("lynia.onboardingSeen");
    expect(deletedKeys).not.toContain("lynia.permissionsPrimed");
    expect(deletedKeys).not.toContain("lynia.session");
  });
});

// Regression guard (UX26-01): a device whose keystore can't persist writes must still be able to sign
// up. Before this fix, a thrown SecureStore.setItemAsync escaped getDeviceId(), client.ts's
// `.catch(() => null)` silently omitted `x-device-id`, and auth.service.ts hard-rejects new-account
// creation with no device id — a permanent onboarding dead end with no recovery path.
describe("getDeviceId (keystore resilience)", () => {
  it("falls back to a process-lifetime id instead of throwing when the keystore write fails", async () => {
    jest.resetModules();
    mockGetItemAsync.mockResolvedValueOnce(null);
    mockSetItemAsync.mockRejectedValueOnce(new Error("keystore write failed"));
    const { getDeviceId: freshGetDeviceId } = require("../session") as typeof import("../session");
    await expect(freshGetDeviceId()).resolves.toEqual(expect.any(String));
  });

  it("falls back to a process-lifetime id instead of throwing when the keystore read fails", async () => {
    jest.resetModules();
    mockGetItemAsync.mockRejectedValueOnce(new Error("keystore decrypt failed"));
    const { getDeviceId: freshGetDeviceId } = require("../session") as typeof import("../session");
    await expect(freshGetDeviceId()).resolves.toEqual(expect.any(String));
  });

  it("caches and returns the same id across calls on a healthy keystore", async () => {
    jest.resetModules();
    mockGetItemAsync.mockResolvedValueOnce(null);
    mockSetItemAsync.mockResolvedValueOnce(undefined);
    const { getDeviceId: freshGetDeviceId } = require("../session") as typeof import("../session");
    const first = await freshGetDeviceId();
    const second = await freshGetDeviceId();
    expect(second).toBe(first);
  });
});

// Regression guard: the getItemAsync read itself can THROW (not just JSON.parse) when the keystore
// entry can't be decrypted — a documented expo-secure-store failure on low-end Android. If that
// rejection escapes loadSession, the boot load in auth-context never resolves and the app hangs on the
// splash forever. loadSession must swallow it and report "no session" so the user can re-authenticate.
describe("loadSession (keychain resilience)", () => {
  it("returns null (does not reject) when the keychain read throws", async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error("keystore decrypt failed"));
    await expect(loadSession()).resolves.toBeNull();
  });

  it("returns null when the stored blob is corrupt JSON", async () => {
    mockGetItemAsync.mockResolvedValueOnce("{not json");
    await expect(loadSession()).resolves.toBeNull();
  });

  it("returns the parsed session on a healthy read", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer" }));
    await expect(loadSession()).resolves.toMatchObject({ profileId: "p1", role: "customer" });
  });
});
