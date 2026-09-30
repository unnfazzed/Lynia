// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeliveriesPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { listBookings } from "../../lib/bookings-api";
import { clearBusinessCache } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";
import { merchantBooking, merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), setOpen: vi.fn(), setBusyMode: vi.fn() }));
vi.mock("../../lib/orders-api", () => ({ getTodaySummary: vi.fn(async () => ({ date: "2026-09-30", delivered: 0, rejected: 0, cashTaken: 0, walletTaken: 0, averagePrepMinutes: null, orders: 4, sales: 86, cashOverdue: 9.5 })) }));
vi.mock("../../lib/bookings-api", () => ({ listBookings: vi.fn() }));

// One stable value, as the real provider memoizes it (the load depends on `signOut`).
vi.mock("../../components/KitchenConnectionProvider", () => {
  const value = { signOut: vi.fn(), actionsDisabled: false };
  return { useKitchenConnection: () => value };
});

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="kitchen-shell" data-active={active}>
      {children}
    </div>
  ),
}));

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Opposite Mbare market", contactPhone: "+263771234567" };

const Page = () => (
  <ToastProvider>
    <DeliveriesPage />
  </ToastProvider>
);

afterEach(() => {
  cleanup();
  clearBusinessCache();
  vi.clearAllMocks();
});

describe("D1 · Shop Orders home (merchant mobile, D-48)", () => {
  it("draws B1's header with Book a rider, and the bookings as trackers", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([
      merchantBooking({ id: "live", state: "finding", itemsSummary: "Car battery", offerCount: 3, expiresAt: new Date(Date.now() + 62_000).toISOString() }),
      merchantBooking({ id: "coming", state: "coming", itemsSummary: "Brake pads", rider: { name: "Blessing Moyo", phone: null, bikeReg: "AFG 2231" }, expiresAt: null }),
      merchantBooking({ id: "gone", state: "cancelled", itemsSummary: "A re-sent booking", rebroadcastedToId: "live" }),
    ]);
    render(<Page />);
    expect(await screen.findByText("Mbare Auto Spares")).toBeTruthy();
    expect(await screen.findByText("$86.00")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Book a rider/ }).getAttribute("href")).toBe("/deliveries/new");
    const list = screen.getByRole("region", { name: "Riders you booked" });
    expect(within(list).getByText("Car battery · 3 offers")).toBeTruthy();
    expect(within(list).getByText("Pick a rider")).toBeTruthy();
    expect(within(list).getByText(/^1:0\d$/)).toBeTruthy();
    expect(within(list).getByText("Brake pads · Blessing M.")).toBeTruthy();
    expect(within(list).getByLabelText("2 of 5 steps")).toBeTruthy();
    expect(screen.queryByText("A re-sent booking")).toBeNull();
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("deliveries");
  });

  it("with none yet, says so", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([]);
    render(<Page />);
    expect(await screen.findByText("No riders booked yet")).toBeTruthy();
  });

  it("says booking is on its way, and offers nothing, on an API that can't book riders yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop" }));
    render(<Page />);
    expect(await screen.findByText("Booking riders is on its way.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Book a rider/ })).toBeNull();
    expect(listBookings).not.toHaveBeenCalled();
  });

  it("offers a retry when the list can't load", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: PIN }));
    vi.mocked(listBookings).mockRejectedValue(new Error("offline"));
    render(<Page />);
    expect(await screen.findByText("Couldn't load your deliveries.")).toBeTruthy();
  });
});
