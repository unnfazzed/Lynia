// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import HoursPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { ApiError } from "../../lib/api-client";
import { getMerchantProfile, setBusyMode, updateHours } from "../../lib/menu-api";

vi.mock("../../lib/menu-api", () => ({
  getMerchantProfile: vi.fn(),
  setBusyMode: vi.fn(),
  updateHours: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { push, replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn() }));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const Page = () => (
  <ToastProvider>
    <HoursPage />
  </ToastProvider>
);
const W = { open: "08:00", close: "22:00" };

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

describe("C5 · Opening hours (merchant mobile, D-48)", () => {
  it("shows one window with the days open, and saves it for those days", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ hours: { mon: W, tue: W, wed: W, thu: W, fri: W, sat: W } as MerchantProfileResponse["hours"] }));
    vi.mocked(updateHours).mockResolvedValue(profile());
    render(<Page />);
    expect((await screen.findByRole("tab", { name: "Same every day" })).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Open") as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByLabelText("Close") as HTMLInputElement).value).toBe("22:00");
    expect(screen.getByRole("button", { name: "Sunday" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(screen.getByLabelText("Close"), { target: { value: "21:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Saturday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    const H = { open: "08:00", close: "21:00" };
    await waitFor(() => expect(updateHours).toHaveBeenCalledWith({ hours: { mon: H, tue: H, wed: H, thu: H, fri: H } }));
    expect(await screen.findByText("Hours saved")).toBeTruthy();
    expect(push).toHaveBeenCalledWith("/account");
  });

  it("opens on Per day when the days differ, and switching keeps what's on screen", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ hours: { mon: W, sat: { open: "10:00", close: "14:00" } } as MerchantProfileResponse["hours"] }));
    render(<Page />);
    expect((await screen.findByRole("tab", { name: "Per day" })).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Saturday opens") as HTMLInputElement).value).toBe("10:00");
    expect(screen.getByRole("switch", { name: "Open on Sunday" }).getAttribute("aria-checked")).toBe("false");
  });

  it("won't save a window that closes before it opens", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    render(<Page />);
    fireEvent.change(await screen.findByLabelText("Open"), { target: { value: "2300" } });
    expect((screen.getByLabelText("Open") as HTMLInputElement).value).toBe("23:00");
    expect(screen.getByText("Times are 24-hour, like 08:00, and the opening time must be before the closing time.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save hours" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("busy mode (LC-D04)", () => {
  // A dropped connection mid-tap must say so: busy mode is for the slammed-kitchen moment.
  it("shows the error and stays off when setBusyMode fails", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(setBusyMode).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Busy mode (+10 min)" }));
    expect(await screen.findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Busy mode (+10 min)" }).getAttribute("aria-checked")).toBe("false");
  });

  it("turns on and says so", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(setBusyMode).mockResolvedValueOnce(profile({ busy: true }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Busy mode (+10 min)" }));
    expect(await screen.findByText("Busy mode on · +10 min")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Busy mode (+10 min)" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("a dead session on a change signs out (LC-D##)", () => {
  it("on saving hours", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateHours).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });

  it("on busy mode", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(setBusyMode).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Busy mode (+10 min)" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});

describe("a failed load has a way out (LC-D##)", () => {
  it("Retry recovers", async () => {
    vi.mocked(getMerchantProfile)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(profile());
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Save hours" })).toBeTruthy();
    expect(getMerchantProfile).toHaveBeenCalledTimes(2);
  });
});

describe("Staff keep busy mode, and read the hours (L4)", () => {
  it("see the hours locked, no Save, and switch busy mode", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ myRole: "staff", hours: { mon: { open: "08:00", close: "20:00" } } as MerchantProfileResponse["hours"] }));
    vi.mocked(setBusyMode).mockResolvedValue(profile({ myRole: "staff", busy: true }));
    render(<Page />);
    expect(await screen.findByText("Only the owner changes the opening hours. You can turn busy mode on and off.")).toBeTruthy();
    expect((screen.getByLabelText("Close") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save hours" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Busy mode (+10 min)" }));
    await waitFor(() => expect(setBusyMode).toHaveBeenCalledWith({ active: true }));
  });
});
