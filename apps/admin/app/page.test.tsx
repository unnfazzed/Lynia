// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OverviewPage from "./page";
import { adminFetch, adminFetchResult } from "./lib/api";

/** Admin console v2 §4: the Overview's three happy-path strips (the rest of the page is unchanged). */
vi.mock("./lib/api", () => ({ adminFetchResult: vi.fn(), adminFetch: vi.fn(async () => null) }));
vi.mock("./components/AutoRefresh", () => ({ AutoRefresh: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const overview = {
  ordersByStatus: { open_for_offers: 2 },
  riders: { total: 5, online: 2, verified: 4 },
  metrics: { totalBroadcasts: 10, offersPerBroadcast: 1.5, pctBroadcastsWithOffer: 80, expiryRatePct: 10 },
  today: { completed: 3, completionRatePct: 75, fares: "12.00" },
  attention: { kycPending: 0, openIssues: 0, stuckOrders: 0, stuckOrderId: null },
  commissionRatePct: 10,
  recentOrders: [],
};

const funnel = (kind: string, range: string) => ({
  kind,
  range,
  from: "",
  to: "",
  cohort: 7,
  truncated: false,
  steps: [
    { key: "signed_up", label: "Signed up", count: 7, pctOfCohort: 100, conversionPct: null, medianMs: null, timedCount: 0, since: null, timesSince: null, stuckList: null },
    { key: "first_order", label: `First ${kind} step`, count: 3, pctOfCohort: 43, conversionPct: 43, medianMs: null, timedCount: 0, since: null, timesSince: null, stuckList: `${kind}_x` },
  ],
});

describe("Overview happy paths", () => {
  it("shows biker, customer and merchant strips for the chosen range, each tile linking to its stuck list", async () => {
    vi.mocked(adminFetchResult).mockImplementation(async (path: string) => {
      const m = /kind=(\w+)&range=(\w+)/.exec(path);
      return (m ? { data: funnel(m[1]!, m[2]!) } : { data: overview }) as never;
    });
    render(await OverviewPage({ searchParams: Promise.resolve({ range: "30d" }) }));
    for (const kind of ["biker", "customer", "merchant"]) {
      expect(adminFetchResult).toHaveBeenCalledWith(`/admin/funnels?kind=${kind}&range=30d`);
      expect(screen.getByRole("link", { name: new RegExp(`First ${kind} step`) }).getAttribute("href")).toBe(`/people?kind=${kind}&range=30d&list=${kind}_x#stuck`);
    }
    expect(screen.getByRole("link", { name: "30 days" }).getAttribute("aria-current")).toBe("page");
    // The existing layout is still there.
    expect(screen.getByText("Live orders")).toBeTruthy();
  });

  it("an API without funnels hides the card and keeps the rest", async () => {
    vi.mocked(adminFetchResult).mockImplementation(async (path: string) => (path.startsWith("/admin/funnels") ? { reason: "not-implemented" } : { data: overview }) as never);
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByLabelText("Happy paths")).toBeNull();
    expect(screen.getByText("Live orders")).toBeTruthy();
  });
});

describe("Overview · the Own bikers tile (OB-A4)", () => {
  const live = async (path: string) => (path.startsWith("/admin/funnels") ? { reason: "not-implemented" } : { data: overview }) as never;

  it("says how many fleets, bikers online and overdue, and opens Own bikers", async () => {
    vi.mocked(adminFetchResult).mockImplementation(live);
    vi.mocked(adminFetch).mockResolvedValue({ ownBikers: { fleets: 3, bikersOnline: 14, overdueBills: 3, overdueFleets: 2 } } as never);
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    const tile = screen.getByLabelText("Own bikers");
    expect(tile.textContent).toBe("Own bikers live: 3 fleets · 14 bikers online · 2 overdueOpen Own bikers");
    expect(screen.getByRole("link", { name: "Open Own bikers" }).getAttribute("href")).toBe("/own-bikers");
  });

  it("shows nothing while no business runs its own bikers, or the API has no counts", async () => {
    vi.mocked(adminFetchResult).mockImplementation(live);
    vi.mocked(adminFetch).mockResolvedValue({ ownBikers: { fleets: 0, bikersOnline: 0, overdueBills: 0 } } as never);
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByLabelText("Own bikers")).toBeNull();
    cleanup();
    vi.mocked(adminFetch).mockResolvedValue(null as never);
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByLabelText("Own bikers")).toBeNull();
  });
});
