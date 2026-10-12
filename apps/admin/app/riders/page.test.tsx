// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RidersPage from "./page";
import { adminFetchResult } from "../lib/api";

/**
 * First Run v2 E4 (D-82): the plate review queue — /riders?plate=checking lists the plates riders added
 * or changed, each with "Confirm plate…"; the directory links to it.
 */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({ verifyPlate: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const rider = {
  profileId: "r-1",
  name: "Tendai Moyo",
  phone: "+263772451180",
  bikeReg: "ABZ 4417",
  plateStatus: "checking",
  kycStatus: "verified",
  idVerified: true,
  isOnline: false,
  accountStatus: "active",
  onHold: false,
  ratingAvg: 4.8,
  ratingCount: 12,
  tripsCount: 30,
  cancelStrikes: 0,
  cooldownUntil: null,
};

describe("Bikers — plate review (D-82)", () => {
  it("asks the API for the checking queue and offers Confirm plate on each row", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: [rider] } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ plate: "checking" }) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/riders?plate=checking");
    expect(screen.getByRole("heading", { name: "Bikers — plate review" })).toBeTruthy();
    expect(screen.getAllByText("ABZ 4417").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Confirm plate/ })).toBeTruthy();
  });

  it("an empty queue says so", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: [] } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ plate: "checking" }) }));
    expect(screen.getByText("No plates to check")).toBeTruthy();
  });

  it("the directory links to the queue and keeps its own columns", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: [rider] } as never);
    render(await RidersPage({ searchParams: Promise.resolve({}) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/riders");
    const link = screen.getByRole("link", { name: "plates to check" });
    expect(link.getAttribute("href")).toBe("/riders?plate=checking");
    expect(screen.queryByRole("button", { name: /Confirm plate/ })).toBeNull();
  });
});

describe("Bikers — KYC queue row", () => {
  it("a pending biker's row offers only Review (no one-click approve that skips the review warnings)", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: [{ ...rider, kycStatus: "pending" }] } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ kyc: "pending" }) }));
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/riders/r-1/kyc");
  });
});

describe("Bikers — KYC queue paging (oldest waiting first)", () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ ...rider, profileId: `r-${i}`, kycStatus: "pending" }));

  it("a full page offers Next, which asks the API for page 2", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: page(100) } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ kyc: "pending" }) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/riders?kyc=pending");
    expect(screen.getByText(/oldest waiting first/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href")).toBe("/riders?kyc=pending&page=2");
    expect(screen.queryByRole("link", { name: "← Previous" })).toBeNull();
  });

  it("page 2 is fetched as such and links back; a short page has no Next", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: page(3) } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ kyc: "pending", page: "2" }) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/riders?kyc=pending&page=2");
    expect(screen.getByRole("link", { name: "← Previous" }).getAttribute("href")).toBe("/riders?kyc=pending&page=1");
    expect(screen.queryByRole("link", { name: "Next →" })).toBeNull();
  });

  it("a short first page shows no pager at all", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: page(3) } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ kyc: "pending" }) }));
    expect(screen.queryByText(/Page 1/)).toBeNull();
  });
});
