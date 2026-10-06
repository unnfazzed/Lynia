// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RiderProfilePage from "./page";
import { adminFetch, adminFetchResult } from "../../lib/api";
import type { RiderDetail } from "../../lib/adminTypes";

/**
 * First Run v2 E4 (D-81): the rider profile shows the plate's check next to "Bike reg" and offers
 * "Confirm plate…" only while it is waiting on review.
 */
vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn(), adminFetch: vi.fn() }));
vi.mock("../actions", () => ({ mutateRider: vi.fn(), verifyPlate: vi.fn(), creditRiderWallet: vi.fn() }));
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

describe("Rider profile — plate check (D-81)", () => {
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
