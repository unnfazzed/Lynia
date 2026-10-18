// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReferralsPage from "./page";
import { referralsCsv } from "./csv";
import { adminFetchResult } from "../lib/api";
import type { AdminReferralRow, AdminReferrals } from "../lib/adminTypes";

/** Biker referrals (D-112): the numbers, the per-biker rollup, each friend's stage and warnings, Mark paid. */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({ markReferralPaid: vi.fn(), createReferralLink: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(over: Partial<AdminReferralRow> = {}): AdminReferralRow {
  return {
    id: "ref-1",
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    referrer: { id: "r-tino", name: "Tino Moyo", code: "K7P3QX" },
    friend: { id: "r-farai", name: "Farai Dube", kycStatus: "verified", verifiedAt: "2026-10-17T09:00:00.000Z", trips: 3, accountStatus: "active" },
    stage: "riding",
    flags: [],
    paid: null,
    ...over,
  };
}

function data(rows: AdminReferralRow[]): AdminReferrals {
  return {
    totals: { referred: rows.length, verified: 2, riding: 1, unpaidVerified: 1, paidCount: 1, paidTotal: "5.00", links: 3 },
    referrers: [
      { id: "r-tino", name: "Tino Moyo", code: "K7P3QX", referred: 2, verified: 2, riding: 1, unpaidVerified: 1, paidCount: 1, paidTotal: "5.00" },
      { id: "r-rudo", name: "Rudo Ncube", code: "M4N8RT", referred: 1, verified: 0, riding: 0, unpaidVerified: 0, paidCount: 0, paidTotal: "0.00" },
    ],
    rows,
    capped: false,
  };
}

async function show(d: AdminReferrals, sp: Record<string, string> = {}) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: d } as never);
  render(await ReferralsPage({ searchParams: Promise.resolve(sp) }));
}

const rows = [
  row(),
  row({ id: "ref-2", friend: { ...row().friend, id: "r-paid", name: "Paid Friend" }, stage: "verified", paid: { at: "2026-10-18T08:00:00.000Z", amount: "5.00" } }),
  row({
    id: "ref-3",
    referrer: { id: "r-rudo", name: "Rudo Ncube", code: "M4N8RT" },
    friend: { ...row().friend, id: "r-new", name: "New Friend", kycStatus: "pending", verifiedAt: null, trips: 0 },
    stage: "joined",
    flags: ["same_device"],
  }),
];

describe("Referrals page", () => {
  it("shows the totals, the per-biker rollup and every referral", async () => {
    await show(data(rows));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/referrals");
    expect(screen.getByText("from 3 links")).toBeTruthy();
    expect(screen.getAllByText("$5.00").length).toBeGreaterThan(0);
    expect(screen.getByText("K7P3QX")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Farai Dube" }).getAttribute("href")).toBe("/riders/r-farai");
    expect(screen.getAllByText("3 jobs")).toHaveLength(2);
    expect(screen.getByText("ID check not passed yet")).toBeTruthy();
    expect(screen.getByText("same phone as referrer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe("/referrals/referrals.csv");
  });

  it("offers Mark paid only for a verified friend not paid yet", async () => {
    await show(data(rows));
    expect(screen.getAllByRole("button", { name: "Mark paid…" })).toHaveLength(1);
    expect(screen.getByText(/\$5\.00 · /)).toBeTruthy();
  });

  it("filters to one biker's friends", async () => {
    await show(data(rows), { referrer: "r-rudo" });
    expect(screen.getByText("Rudo Ncube's friends")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Farai Dube" })).toBeNull();
    expect(screen.getByRole("link", { name: "New Friend" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Show all" }).getAttribute("href")).toBe("/referrals");
  });

  it("says what to do when there are none, and when the API is down", async () => {
    await show({ ...data([]), referrers: [] });
    expect(screen.getByText(/Create a biker's link on their biker page/)).toBeTruthy();
    cleanup();
    vi.mocked(adminFetchResult).mockResolvedValue({ reason: "unreachable" } as never);
    render(await ReferralsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("referralsCsv", () => {
  it("writes one quoted line per referral and defuses formulas", () => {
    const csv = referralsCsv(data([row({ friend: { ...row().friend, name: "=HYPERLINK(\"x\")" }, flags: ["same_id", "not_active"] })]));
    const [header, line] = csv.trim().split("\n");
    expect(header?.split(",")).toContain("paid_amount");
    expect(line).toContain('"\'=HYPERLINK(""x"")"');
    expect(line).toContain("same ID as referrer; suspended or banned");
    expect(line).toContain(",riding,verified,");
  });
});
