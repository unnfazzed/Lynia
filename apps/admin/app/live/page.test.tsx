// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LivePage from "./page";
import { adminFetchResult } from "../lib/api";
import type { Fleet, LiveOrders } from "../lib/adminTypes";

/** Admin console v2 §7 — Live: the order monitor (past the limit first) and the map of bikers online. */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ORDER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORDER_B = "bbbbbbbb-0000-4000-8000-000000000002";

const live: LiveOrders = {
  generatedAt: "2026-10-13T08:30:00Z",
  counts: { total: 2, breach: 1, warn: 0 },
  rows: [
    {
      id: ORDER_A,
      orderType: "parcel",
      status: "en_route_dropoff",
      merchantPhase: null,
      stage: "delivery",
      stageLabel: "On the way, no update",
      stageStartedAt: "2026-10-13T08:00:00Z",
      limitMs: 20 * 60_000,
      elapsedMs: 30 * 60_000,
      breach: "breach",
      createdAt: "2026-10-13T07:30:00Z",
      customer: { id: "c-1", name: "Rudo N" },
      rider: { id: "r-1", name: "Tendai M" },
      merchant: null,
    },
    {
      id: ORDER_B,
      orderType: "merchant",
      status: "requested",
      merchantPhase: "awaiting_accept",
      stage: "merchant_accept",
      stageLabel: "Venue hasn't accepted",
      stageStartedAt: "2026-10-13T08:29:00Z",
      limitMs: 3 * 60_000,
      elapsedMs: 60_000,
      breach: "ok",
      createdAt: "2026-10-13T08:29:00Z",
      customer: { id: "c-2", name: "Farai C" },
      rider: null,
      merchant: { id: "m-1", name: "Mama's Kitchen" },
    },
  ],
};

const fleet: Fleet = {
  generatedAt: "2026-10-13T08:30:00Z",
  riders: [
    { riderId: "r-1", name: "Tendai M", position: { lat: -17.81, lng: 31.05, at: new Date().toISOString(), fresh: true }, orderId: ORDER_A },
    { riderId: "r-2", name: "Nyasha K", position: null, orderId: null },
  ],
  orders: [{ orderId: ORDER_A, orderType: "parcel", status: "en_route_dropoff", breach: "breach", riderId: "r-1", pickup: { lat: -17.8, lng: 31.04 }, dropoff: { lat: -17.83, lng: 31.07 } }],
};

function mockApi(orders: unknown, fl: unknown) {
  vi.mocked(adminFetchResult).mockImplementation(async (path: string) => (path === "/admin/live/orders" ? orders : fl) as never);
}

describe("Live page", () => {
  it("QA-B03: shows every not-ended order as Active, and how many the monitor can't time", async () => {
    mockApi({ data: { ...live, counts: { ...live.counts, active: 4, untimed: 2 } } }, { data: fleet });
    render(await LivePage());
    expect(screen.getByText("Active orders").closest(".kpi")?.textContent).toContain("4");
    expect(screen.getByText(/No timer: 2/)).toBeTruthy();
  });

  it("lists active orders past the limit first, with the step, the clock and a link to the order", async () => {
    mockApi({ data: live }, { data: fleet });
    render(await LivePage());
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/live/orders");
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/live/fleet");
    expect(screen.getByText("On the way, no update")).toBeTruthy();
    expect(screen.getByText("Over by 10 min")).toBeTruthy();
    expect(screen.getByText("On time")).toBeTruthy();
    const rows = screen.getAllByRole("row");
    // header row, then the breach row first.
    expect(within(rows[1]!).getByText("#aaaaaa")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "#aaaaaa" })[0]!.getAttribute("href")).toBe(`/orders/${ORDER_A}`);
    expect(screen.getByRole("link", { name: "Mama's Kitchen" }).getAttribute("href")).toBe("/merchants/m-1");
  });

  it("draws the map and lists bikers online, saying who has no position yet", async () => {
    mockApi({ data: live }, { data: fleet });
    const { container } = render(await LivePage());
    expect(screen.getByRole("img", { name: /1 bikers and 1 active orders/ })).toBeTruthy();
    expect(container.querySelector(`svg.live-map a[href="/riders/r-1"]`)).toBeTruthy();
    expect(container.querySelector(`svg.live-map a[href="/orders/${ORDER_A}"]`)).toBeTruthy();
    expect(screen.getByText("1 biker has no position yet")).toBeTruthy();
    expect(screen.getByText("none yet")).toBeTruthy();
  });

  it("nothing live says so", async () => {
    mockApi({ data: { ...live, counts: { total: 0, breach: 0, warn: 0 }, rows: [] } }, { data: { ...fleet, riders: [], orders: [] } });
    render(await LivePage());
    expect(screen.getByText("No active orders")).toBeTruthy();
    expect(screen.getByText("No bikers online")).toBeTruthy();
    expect(screen.getByText("Nothing to show yet")).toBeTruthy();
  });

  it("an unreachable API shows the banner, not an empty board", async () => {
    mockApi({ reason: "unreachable" }, { reason: "unreachable" });
    render(await LivePage());
    expect(screen.getByText("API unreachable.")).toBeTruthy();
    expect(screen.queryByText("No active orders")).toBeNull();
  });
});
