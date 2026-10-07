/**
 * MA-H3: the one rider → customer switch the Account toggle and the Notifications sheet share. Both used
 * to differ — Notifications never saved the side, so a relaunch put the rider back online getting jobs.
 */
const mockSetOnline = jest.fn();
const mockSaveRole = jest.fn(async (_role: string) => undefined);
jest.mock("../../api/riders", () => ({ setOnline: (online: boolean) => mockSetOnline(online) }));
jest.mock("../../auth/session", () => ({ saveRolePreference: (role: string) => mockSaveRole(role) }));

import { switchToCustomer } from "../switch-to-customer";

beforeEach(() => {
  mockSetOnline.mockReset();
  mockSaveRole.mockClear();
});

describe("switchToCustomer", () => {
  it("no job running: saves the customer side and goes offline", async () => {
    mockSetOnline.mockResolvedValue({ online: false });
    await expect(switchToCustomer(false)).resolves.toBe(true);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it("reports a failed go-offline instead of swallowing it", async () => {
    mockSetOnline.mockRejectedValue(new Error("offline"));
    await expect(switchToCustomer(false)).resolves.toBe(false);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
  });

  it("a job running: saves the side, stays online for the job", async () => {
    await expect(switchToCustomer(true)).resolves.toBe(true);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockSetOnline).not.toHaveBeenCalled();
  });
});
