// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfigPage from "./page";
import { adminFetchResult } from "../lib/api";
import type { AdminConfig } from "../lib/adminTypes";

/** Admin console v2 §7 — Settings: the switches the services run with, read-only. */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const config: AdminConfig = {
  environment: "production",
  penaltiesSuspended: true,
  commission: { ratePct: 10, freeFirstJobs: 10, minTopUp: 5, maxTopUp: 50 },
  topUps: { paymentRail: "paynow", rails: ["ecocash", "innbucks"], feePct: 2.5, feeMode: "paynow" },
  wallet: { manualCreditCapUsd: 50, reversalCapUsd: 50 },
  kyc: { mode: "manual", provider: "didit" },
  verticals: { restaurants: true, shops: false, pharmacy: true, prescriptions: true, autoDispatch: false, merchantWallet: false, notificationsFeed: true },
  gpsRetentionDays: 90,
  sla: [{ stage: "merchant_accept", label: "Venue hasn't accepted", limitMinutes: 3, note: null }],
};

describe("Settings page", () => {
  it("shows commission, top-ups, penalties, KYC, the services and the time limits", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: config } as never);
    render(await ConfigPage());
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/config");
    expect(screen.getByText("10% of each job")).toBeTruthy();
    expect(screen.getByText("First 10 jobs, no commission")).toBeTruthy();
    expect(screen.getByText("EcoCash, InnBucks")).toBeTruthy();
    expect(screen.getByText("2.5%, added by Paynow")).toBeTruthy();
    expect(screen.getByText("Suspended")).toBeTruthy();
    expect(screen.getByText("Manual review")).toBeTruthy();
    expect(screen.getByText("PENALTIES_SUSPENDED")).toBeTruthy();
    expect(screen.getAllByText("On").length).toBe(4);
    expect(screen.getAllByText("Off").length).toBe(3);
    expect(screen.getByText("Venue hasn't accepted")).toBeTruthy();
    expect(screen.getByText("3 min")).toBeTruthy();
    // Read-only: nothing to press.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a stub payment rail is flagged", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: { ...config, topUps: { ...config.topUps, paymentRail: "stub" } } } as never);
    render(await ConfigPage());
    expect(screen.getByText("Stub: nothing is charged")).toBeTruthy();
  });

  it("an older API without the endpoint says so", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ reason: "not-implemented" } as never);
    render(await ConfigPage());
    expect(screen.getByText("Settings not available yet")).toBeTruthy();
  });
});
