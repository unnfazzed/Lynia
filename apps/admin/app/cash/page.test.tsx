// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CashPage from "./page";
import { adminFetch, adminFetchResult } from "../lib/api";
import type { MoneyPanel } from "../lib/adminTypes";

/** Admin console v2 §6 — the platform money panel on /cash. */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn(), adminFetch: vi.fn() }));
vi.mock("./actions", () => ({ runIntegrityCheck: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const panel: MoneyPanel = {
  days: 7,
  ratePct: 10,
  rows: [{ day: "2026-10-13", topupsIn: "15.00", fees: "0.38", commission: "1.50", manualCredits: "5.00", reversals: "2.00", freeJobs: 4 }],
  totals: { topupsIn: "15.00", fees: "0.38", commission: "1.50", manualCredits: "5.00", reversals: "2.00", freeJobs: 4 },
  float: "120.50",
  receivable: "7.25",
  owedCount: 2,
  integrity: { at: "2026-10-13T00:00:00Z", ok: false, totalDrift: 1, accountsChecked: 40, drift: { balance_mismatch: 1, missing_receipt: 0 } },
};

const overview = { model: "prepaid_per_ride", ratePct: 10, periodLabel: "x", kpis: { ratePct: 10, rides: 0, fares: "0.00", commission: "0.00" }, rows: [] };

async function show(p: MoneyPanel | null, sp: Record<string, string> = {}) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: overview } as never);
  vi.mocked(adminFetch).mockImplementation(async (path: string) => (path.startsWith("/admin/cash/money") ? p : []) as never);
  render(await CashPage({ searchParams: Promise.resolve(sp) }));
}

describe("Commission page — platform money panel", () => {
  it("shows top-ups in, fees, commission, manual credits, float, receivable and the ledger check", async () => {
    await show(panel);
    expect(adminFetch).toHaveBeenCalledWith("/admin/cash/money?days=7");
    expect(screen.getByText("Platform money")).toBeTruthy();
    expect(screen.getByText("$120.50")).toBeTruthy();
    expect(screen.getByText("$7.25")).toBeTruthy();
    expect(screen.getByRole("link", { name: "2 bikers owe this →" }).getAttribute("href")).toBe("/cash/owed");
    expect(screen.getByText("ledger check: 1 problems")).toBeTruthy();
    expect(screen.getByText(/balance ≠ ledger 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run now" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "CSV" }).getAttribute("href")).toBe("/cash/money.csv?days=7");
    expect(screen.getByRole("link", { name: "top-ups" }).getAttribute("href")).toBe("/cash/topups");
  });

  it("30 days when chosen", async () => {
    await show({ ...panel, days: 30 }, { days: "30" });
    expect(adminFetch).toHaveBeenCalledWith("/admin/cash/money?days=30");
    expect(screen.getByRole("link", { name: "CSV" }).getAttribute("href")).toBe("/cash/money.csv?days=30");
  });

  it("an API without the panel says so and keeps the rest of the page", async () => {
    await show(null);
    expect(screen.getByText("Money panel unavailable")).toBeTruthy();
    expect(screen.getByText("By biker")).toBeTruthy();
  });
});
