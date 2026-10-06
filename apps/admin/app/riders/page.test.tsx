// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RidersPage from "./page";
import { adminFetchResult } from "../lib/api";

/**
 * First Run v2 E4 (D-80): the plate review queue — /riders?plate=checking lists the plates riders added
 * or changed, each with "Confirm plate…"; the directory links to it.
 */
vi.mock("../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({ setKyc: vi.fn(), verifyPlate: vi.fn() }));
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

describe("Riders — plate review (D-80)", () => {
  it("asks the API for the checking queue and offers Confirm plate on each row", async () => {
    vi.mocked(adminFetchResult).mockResolvedValue({ data: [rider] } as never);
    render(await RidersPage({ searchParams: Promise.resolve({ plate: "checking" }) }));
    expect(adminFetchResult).toHaveBeenCalledWith("/admin/riders?plate=checking");
    expect(screen.getByRole("heading", { name: "Riders — plate review" })).toBeTruthy();
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
