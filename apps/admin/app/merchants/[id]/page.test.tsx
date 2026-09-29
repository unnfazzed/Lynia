// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MerchantProfilePage from "./page";
import { adminFetchResult } from "../../lib/api";
import type { MerchantDetail } from "../../lib/adminTypes";

vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("../actions", () => ({ setMerchantPilot: vi.fn() }));
vi.mock("../../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function detail(over: Partial<MerchantDetail> = {}): MerchantDetail {
  return {
    id: "m-1",
    name: "Mbare Auto Spares",
    cashRule: "collect_and_return",
    pilotEnabled: false,
    busyMode: false,
    cuisineTags: [],
    businessType: "shop",
    shopKind: "auto_parts",
    landmark: "Opposite Mbare market",
    contactPhoneMasked: "+263•••••4567",
    orders: 0,
    openDebtAmount: "0.00",
    openDebtCount: 0,
    joined: "29 Sep 2026",
    description: null,
    priceLevel: null,
    contactPhone: "+263771234567",
    pin: { lat: -17.83, lng: 31.05 },
    trail: [],
    debtLedger: [],
    debtLedgerNextCursor: null,
    ...over,
  };
}

async function open(m: MerchantDetail) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: m });
  render(await MerchantProfilePage({ params: Promise.resolve({ id: m.id }), searchParams: Promise.resolve({}) }));
}

describe("Merchant profile: holding a business's bookings (merchant web upgrade L2, R2-5)", () => {
  it("links to the booking account, where ops holds every booking the business makes", async () => {
    await open(detail({ bookingAccount: { id: "p-booking", onHold: false } }));
    const link = screen.getByRole("link", { name: "Active — hold it on the booking account →" });
    expect(link.getAttribute("href")).toBe("/customers/p-booking");
  });

  it("says when the business's bookings are on hold", async () => {
    await open(detail({ bookingAccount: { id: "p-booking", onHold: true } }));
    expect(screen.getByRole("link", { name: "On hold — lift it on the booking account →" })).toBeTruthy();
  });

  it("before the first booking there's no account to hold yet", async () => {
    await open(detail({ bookingAccount: null }));
    expect(screen.getByText("No bookings yet")).toBeTruthy();
  });

  it("shows nothing about bookings on an API that can't book riders yet", async () => {
    await open(detail());
    expect(screen.queryByText("Book a rider")).toBeNull();
  });
});
