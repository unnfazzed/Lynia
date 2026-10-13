// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MerchantsPage from "./page";
import { adminFetchResult } from "../lib/api";
import type { Merchant } from "../lib/adminTypes";

vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({}));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(over: Partial<Merchant> = {}): Merchant {
  return {
    id: "m-1",
    name: "Sadza Republic",
    cashRule: "collect_and_return",
    pilotEnabled: false,
    busyMode: false,
    cuisineTags: [],
    businessType: "restaurant",
    shopKind: null,
    landmark: "Next to the rank",
    contactPhoneMasked: "+263•••••4567",
    orders: 0,
    openDebtAmount: "0.00",
    openDebtCount: 0,
    joined: "10 Oct 2026",
    applicationStatus: "applied",
    ...over,
  };
}

async function open(searchParams: Record<string, string>, rows: Merchant[]) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: rows });
  render(await MerchantsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Merchants: the application queue (admin console v2 §5)", () => {
  it("?status=applied asks the API for the queue and shows age, SLA, area, score and status", async () => {
    const appliedAt = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
    await open({ status: "applied" }, [row({ appliedAt, ageMs: 50 * 3600 * 1000, sla: "red", score: { passed: 5, total: 7 } })]);
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/merchants?status=applied");
    expect(screen.getByText("Signed up, not reviewed yet. Oldest first. Call each within a day.")).toBeTruthy();
    expect(screen.getByText("5/7")).toBeTruthy();
    expect(screen.getByText("Next to the rank")).toBeTruthy();
    const sla = screen.getByText("2 d");
    expect(sla.className).toContain("bad");
    expect(screen.getByRole("columnheader", { name: "Waiting" })).toBeTruthy();
  });

  it("an amber SLA uses the warn pill", async () => {
    const appliedAt = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    await open({ status: "reviewing" }, [row({ applicationStatus: "reviewing", appliedAt, sla: "amber", score: { passed: 3, total: 6 } })]);
    expect(screen.getByText("1 d").className).toContain("warn");
  });

  it("has a chip for every state, and the old go-live filter opens the applied queue", async () => {
    await open({ filter: "awaiting_go_live" }, []);
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/merchants?status=applied");
    for (const chip of ["applied", "in review", "approved", "live", "rejected", "suspended"]) {
      expect(screen.getByRole("link", { name: chip })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "applied" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("No one is waiting.")).toBeTruthy();
  });

  it("the directory shows each business's status", async () => {
    await open({}, [row({ applicationStatus: "suspended" }), row({ id: "m-2", name: "Avenues Pharmacy", applicationStatus: undefined, pilotEnabled: true })]);
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/merchants");
    expect(screen.getByText("Suspended")).toBeTruthy();
    // An older API without the status: live from the switch.
    expect(screen.getAllByText("live").some((el) => el.className.includes("kpill good"))).toBe(true);
  });
});
