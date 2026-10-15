/**
 * MA-H3: the one rider → customer switch the Account toggle and the Notifications sheet share. Both used
 * to differ — Notifications never saved the side, so a relaunch put the rider back online getting jobs.
 */
const mockSetOnline = jest.fn();
const mockSaveRole = jest.fn(async (_role: string) => undefined);
const mockGetActive = jest.fn();
jest.mock("../../api/riders", () => ({ setOnline: (online: boolean) => mockSetOnline(online) }));
jest.mock("../../api/orders", () => ({ getActiveOrder: () => mockGetActive() }));
jest.mock("../../auth/session", () => ({ saveRolePreference: (role: string) => mockSaveRole(role) }));

import { switchToCustomer } from "../switch-to-customer";

beforeEach(() => {
  mockSetOnline.mockReset();
  mockSaveRole.mockClear();
  mockGetActive.mockReset();
});
const noWait = async (): Promise<void> => undefined;

describe("switchToCustomer", () => {
  it("no job running: saves the customer side and goes offline", async () => {
    mockSetOnline.mockResolvedValue({ online: false });
    await expect(switchToCustomer(false)).resolves.toBe(true);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it("reports a failed go-offline instead of swallowing it", async () => {
    mockSetOnline.mockRejectedValue(new Error("offline"));
    await expect(switchToCustomer(false, noWait)).resolves.toBe(false);
    expect(mockSetOnline).toHaveBeenCalledTimes(2);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
  });

  it("a job running: saves the side, stays online for the job", async () => {
    await expect(switchToCustomer(true)).resolves.toBe(true);
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockSetOnline).not.toHaveBeenCalled();
  });

  it("JQ-R3-04: retries a failed go-offline once before reporting it", async () => {
    mockSetOnline.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue({ online: false });
    await expect(switchToCustomer(false, noWait)).resolves.toBe(true);
    expect(mockSetOnline).toHaveBeenCalledTimes(2);
  });

  it("JQ-R3-04: an unsettled job read asks the server, and a running job keeps the rider online", async () => {
    mockGetActive.mockResolvedValue({ id: "o1", status: "picked_up" });
    await expect(switchToCustomer(null)).resolves.toBe(true);
    expect(mockSetOnline).not.toHaveBeenCalled();
  });

  it("JQ-R3-04: an unsettled job read with no job on the server goes offline", async () => {
    mockGetActive.mockResolvedValue(null);
    mockSetOnline.mockResolvedValue({ online: false });
    await expect(switchToCustomer(null)).resolves.toBe(true);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });
});
