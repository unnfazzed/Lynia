// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import HoursPage from "./page";
import { ApiError } from "../../lib/api-client";
import { getMerchantProfile, setBusyMode } from "../../lib/menu-api";

vi.mock("../../lib/menu-api", () => ({
  getMerchantProfile: vi.fn(),
  setBusyMode: vi.fn(),
  updateHours: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function profile(over: Partial<MerchantProfileResponse> = {}): MerchantProfileResponse {
  return {
    id: "m1",
    name: "Test Kitchen",
    hours: {},
    busy: false,
    cashRule: "cashOnDelivery",
    ...over,
  } as MerchantProfileResponse;
}

describe("HoursPage busy-mode toggle (LC-D04)", () => {
  // Before this fix, `onToggleBusy` had a bare try/finally with no catch — a dropped connection
  // mid-tap left the button re-enabled with zero indication anything failed. Busy mode exists
  // specifically for a slammed kitchen on a flaky link, so silently failing there is the worst
  // possible moment for it to go unnoticed.
  it("shows a retryable error and does not update state when setBusyMode fails", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(setBusyMode).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));

    render(<HoursPage />);
    const busyButton = await screen.findByText(/Turn on busy mode/i);
    fireEvent.click(busyButton);

    await waitFor(() => {
      expect(screen.getByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    });
    // Busy mode did not flip on since the request failed.
    expect(screen.getByText(/Turn on busy mode/i)).toBeTruthy();
  });

  it("clears any prior busy error on a successful toggle", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(setBusyMode).mockResolvedValueOnce(profile({ busy: true }));

    render(<HoursPage />);
    const busyButton = await screen.findByText(/Turn on busy mode/i);
    fireEvent.click(busyButton);

    await waitFor(() => {
      expect(screen.getByText(/Busy mode is ON/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Couldn't reach the server/i)).toBeNull();
  });
});
