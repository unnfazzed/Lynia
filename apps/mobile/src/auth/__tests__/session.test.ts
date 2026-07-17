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
import { clearDeviceState } from "../session";

afterEach(() => {
  mockDeleteItemAsync.mockClear();
});

describe("clearDeviceState (sign-out wipe, BH-17)", () => {
  it("deletes the pickup-checklist draft key — the only per-order draft this wipe previously missed", async () => {
    await clearDeviceState();
    const deletedKeys = mockDeleteItemAsync.mock.calls.map((c) => c[0]);
    expect(deletedKeys).toContain(PICKUP_CHECKLIST_DRAFT_KEY);
  });
});
