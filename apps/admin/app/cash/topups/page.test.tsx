// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopupsPage from "./page";
import { adminFetchResult } from "../../lib/api";
import type { AdminTopupRow, AdminTopupsPage } from "../../lib/adminTypes";

/** Admin console v2 §6 — the Top-ups page: every intent, the anomaly queue chips, and the per-row actions. */
vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("../actions", () => ({ topupAction: vi.fn() }));
vi.mock("../../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(over: Partial<AdminTopupRow> = {}): AdminTopupRow {
  return {
    id: "t1",
    riderId: "r-1",
    riderName: "Tendai Moyo",
    amount: "5.00",
    fee: "0.13",
    charged: "5.13",
    rail: "ecocash",
    providerRef: "1234567",
    status: "pending",
    declineReason: null,
    initiatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    resolvedAt: null,
    credited: null,
    manual: false,
    anomaly: null,
    ...over,
  };
}

function pageOf(rows: AdminTopupRow[], over: Partial<AdminTopupsPage> = {}): AdminTopupsPage {
  return {
    rows,
    page: 1,
    pageSize: 50,
    hasMore: false,
    counts: { pending: 1, confirmed: 4, declined: 2, expired: 0, short_paid: 1, paid_on_declined: 0 },
    ...over,
  };
}

async function show(data: AdminTopupsPage, sp: Record<string, string> = {}) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data } as never);
  render(await TopupsPage({ searchParams: Promise.resolve(sp) }));
}

describe("Top-ups page", () => {
  it("lists biker (linked), amount, fee, charged, rail, Paynow ref and status, with counted chips", async () => {
    await show(pageOf([row()]));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/cash/topups");
    expect(screen.getByRole("link", { name: "Tendai Moyo" }).getAttribute("href")).toBe("/riders/r-1");
    expect(screen.getByText("$5.13")).toBeTruthy();
    expect(screen.getByText("1234567")).toBeTruthy();
    expect(screen.getByText("EcoCash")).toBeTruthy();
    expect(screen.getByRole("link", { name: "short-paid · 1" }).getAttribute("href")).toBe("/cash/topups?filter=short_paid");
    // A pending Paynow top-up can be re-polled; with no anomaly there is nothing to credit or resolve.
    expect(screen.getByRole("button", { name: "Re-poll" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Credit what was paid" })).toBeNull();
  });

  it("a short-paid top-up says what Paynow reported and offers Credit what was paid + Mark resolved", async () => {
    await show(pageOf([row({ anomaly: { kind: "short_paid", paid: 3.08, at: new Date().toISOString(), resolved: false } })]), { filter: "short_paid" });
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/cash/topups?filter=short_paid");
    expect(screen.getByText("Paynow says $3.08 paid")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Credit what was paid" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeTruthy();
  });

  it("a declined top-up shows its reason; a manual credit offers nothing", async () => {
    await show(
      pageOf([
        row({ id: "t2", status: "declined", declineReason: "rail_failed" }),
        row({ id: "t3", status: "confirmed", manual: true, rail: "manual", providerRef: null, fee: null, charged: null, credited: "10.00" }),
      ]),
    );
    expect(screen.getByText("Refused by Paynow")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Re-poll" })).toBeNull();
  });

  it("pages: a full page offers Next, keeping the filter", async () => {
    await show(pageOf([row()], { hasMore: true, page: 2 }), { filter: "pending", page: "2" });
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/cash/topups?filter=pending&page=2");
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href")).toBe("/cash/topups?filter=pending&page=3");
    expect(screen.getByRole("link", { name: "← Previous" }).getAttribute("href")).toBe("/cash/topups?filter=pending");
  });

  it("nothing matching a filter says so", async () => {
    await show(pageOf([]), { filter: "expired" });
    expect(screen.getByText("Nothing matches this filter.")).toBeTruthy();
  });
});
