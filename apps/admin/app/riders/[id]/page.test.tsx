// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RiderProfilePage from "./page";
import { adminFetch, adminFetchResult } from "../../lib/api";
import type { RiderDetail } from "../../lib/adminTypes";

/**
 * First Run v2 E4 (D-82): the rider profile shows the plate's check next to "Bike reg" and offers
 * "Confirm plate…" only while it is waiting on review.
 */
vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn(), adminFetch: vi.fn() }));
vi.mock("../actions", () => ({ mutateRider: vi.fn(), verifyPlate: vi.fn(), creditRiderWallet: vi.fn(), reverseRiderWallet: vi.fn() }));
vi.mock("../../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function detail(over: Partial<RiderDetail> = {}): RiderDetail {
  return {
    id: "r-1",
    name: "Tendai Moyo",
    phone: "+263772451180",
    bike: "ABZ 4417",
    plateStatus: "checking",
    kyc: "verified",
    status: "offline",
    trips: 30,
    rating: "4.8",
    ratingCount: 12,
    completion: "97%",
    strikes: 0,
    commission: "0.00",
    activeOrders: 0,
    joined: "Sep 2026",
    trail: [],
    ...over,
  };
}

async function show(d: RiderDetail): Promise<void> {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: d } as never);
  vi.mocked(adminFetch).mockResolvedValue(null as never);
  render(await RiderProfilePage({ params: Promise.resolve({ id: d.id }), searchParams: Promise.resolve({}) }));
}

describe("Biker profile — plate check (D-82)", () => {
  it("a plate waiting on review reads 'checking' and offers Confirm plate", async () => {
    await show(detail());
    expect(screen.getByText("checking")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm plate/ })).toBeTruthy();
  });

  it("a confirmed plate reads 'verified' and offers nothing", async () => {
    await show(detail({ plateStatus: "verified" }));
    expect(screen.getAllByText("verified").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Confirm plate/ })).toBeNull();
  });

  it("an older API without plateStatus shows the plate alone", async () => {
    await show(detail({ plateStatus: undefined }));
    expect(screen.queryByText("checking")).toBeNull();
    expect(screen.queryByRole("button", { name: /Confirm plate/ })).toBeNull();
  });
});

describe("Biker profile — statement (admin console v2 §6)", () => {
  const wallet = {
    balance: "-1.20",
    nextCursor: null,
    summary: {
      ratePct: 10,
      commissionActive: true,
      tripsCount: 12,
      freeJobsLeft: 0,
      pendingCommission: "0.60",
      pendingJobs: 2,
      lastTopup: { id: "t1", amount: "5.00", rail: "ecocash", manual: false, at: "2026-10-12T09:00:00Z" },
    },
    ledger: [
      { id: "l1", type: "ride_commission", amount: "-0.40", balanceAfter: "-1.20", note: null, actor: "system", actorName: "system", orderId: "11111111-2222-3333-4444-555555555555", ratePct: "10.00", fare: "4.00", at: "2026-10-13T09:00:00Z" },
      { id: "l2", type: "free_job", amount: "0.00", balanceAfter: "-0.80", note: "Free job 10 of 10", actor: "system", actorName: "system", orderId: "22222222-2222-3333-4444-555555555555", ratePct: "10.00", fare: "3.00", at: "2026-10-12T10:00:00Z" },
      { id: "l3", type: "topup", amount: "5.00", balanceAfter: "-0.80", note: null, actor: "system", actorName: "system", orderId: null, reversed: null, topUp: { id: "t1", rail: "ecocash", manual: false, ref: "1234567", charged: "5.13", fee: "0.13" }, at: "2026-10-12T09:00:00Z" },
      { id: "l4", type: "topup", amount: "2.00", balanceAfter: "-5.80", note: "launch grace", actor: "a-1", actorName: "Rudo Ops", orderId: null, reversed: "2.00", topUp: { id: "t0", rail: "manual", manual: true, ref: null, charged: null, fee: null }, at: "2026-10-01T09:00:00Z" },
    ],
  };

  it("shows the header (balance owed, free jobs left, commission to come, last top-up) and what each row was", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: detail() } as never);
    vi.mocked(adminFetch).mockImplementation((async (path: string) => (path.includes("/wallet") ? wallet : null)) as never);
    render(await RiderProfilePage({ params: Promise.resolve({ id: "r-1" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Free jobs left")).toBeTruthy();
    expect(screen.getByText("2 delivered, not closed yet")).toBeTruthy();
    expect(screen.getByText("owed")).toBeTruthy();
    expect(screen.getByText("10% of $4.00")).toBeTruthy();
    expect(screen.getByText("Free job · 10% of $3.00 waived")).toBeTruthy();
    expect(screen.getByText("EcoCash · 1234567 · fee $0.13")).toBeTruthy();
    expect(screen.getByText("Manual credit · $2.00 reversed")).toBeTruthy();
    expect(screen.getByText("Rudo Ops")).toBeTruthy();
    // A credit with something left to reverse offers Reverse…; one reversed in full doesn't.
    expect(screen.getAllByRole("button", { name: "Reverse…" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Take off balance…" })).toBeTruthy();
  });

  it("an older API (no summary) keeps the plain ledger and offers no reversal", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: detail() } as never);
    vi.mocked(adminFetch).mockImplementation((async (path: string) => (path.includes("/wallet") ? { ...wallet, summary: undefined } : null)) as never);
    render(await RiderProfilePage({ params: Promise.resolve({ id: "r-1" }), searchParams: Promise.resolve({}) }));
    expect(screen.queryByText("Free jobs left")).toBeNull();
    expect(screen.queryByRole("button", { name: /Reverse|Take off/ })).toBeNull();
  });
});

describe("Biker profile — Show number (owner 2026-10-18)", () => {
  async function showWith(phone: string, allowed: boolean): Promise<void> {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: detail({ phone }) } as never);
    vi.mocked(adminFetch).mockImplementation((async (path: string) => (path === "/admin/phone-reveal" ? { allowed } : null)) as never);
    render(await RiderProfilePage({ params: Promise.resolve({ id: "r-1" }), searchParams: Promise.resolve({}) }));
  }

  it("offers Show number on a masked phone when the operator may reveal", async () => {
    await showWith("+263••••••1180", true);
    expect(screen.getByText("+263••••••1180")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show number" })).toBeTruthy();
  });

  it("offers nothing to an operator who may not", async () => {
    await showWith("+263••••••1180", false);
    expect(screen.queryByRole("button", { name: "Show number" })).toBeNull();
  });

  it("a number already in full (live order) needs no button", async () => {
    await showWith("+263772451180", true);
    expect(screen.getByText("0772451180")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show number" })).toBeNull();
  });
});

describe("Biker profile — Call biker (owner 2026-10-18)", () => {
  async function showWith(phone: string, allowed: boolean): Promise<void> {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: detail({ phone }) } as never);
    vi.mocked(adminFetch).mockImplementation((async (path: string) => (path === "/admin/phone-reveal" ? { allowed } : null)) as never);
    render(await RiderProfilePage({ params: Promise.resolve({ id: "r-1" }), searchParams: Promise.resolve({}) }));
  }

  it("a masked number becomes a button that fetches the real number, for an operator who may", async () => {
    await showWith("+263••••••1180", true);
    const call = screen.getByRole("button", { name: /Call biker/ }) as HTMLButtonElement;
    expect(call.disabled).toBe(false);
    expect(screen.queryByRole("link", { name: /Call biker/ })).toBeNull();
  });

  it("is disabled for anyone else, never a link that dials the bullets", async () => {
    await showWith("+263••••••1180", false);
    expect((screen.getByRole("button", { name: /Call biker/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a number already in full (live order) dials straight away", async () => {
    await showWith("+263772451180", false);
    expect(screen.getByRole("link", { name: /Call biker/ }).getAttribute("href")).toBe("tel:+263772451180");
  });
});
