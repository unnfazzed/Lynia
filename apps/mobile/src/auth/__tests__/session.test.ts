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

import { PICKUP_CHECKLIST_DRAFT_KEY } from "../../logic/pickup-checklist-draft";
import { RIDER_SENT_OFFERS_KEY } from "../../logic/rider-bid-draft";
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
