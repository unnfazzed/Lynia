// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeliveriesPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { listBookings } from "../../lib/bookings-api";
import { clearBusinessCache } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";
import { merchantBooking, merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), setOpen: vi.fn(), setBusyMode: vi.fn() }));
vi.mock("../../lib/orders-api", () => ({ getTodayKpis: vi.fn(async () => ({ date: "2026-09-30", orders: 4, sales: 86, cashDue: 9.5, cashOverdue: 9.5 })) }));
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
  it("draws S1's top card with Book a rider and no KPI strip (Merchant v2, D-77), and the bookings as trackers", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([
      merchantBooking({ id: "live", state: "finding", itemsSummary: "Car battery", offerCount: 3, expiresAt: new Date(Date.now() + 62_000).toISOString() }),
      merchantBooking({ id: "coming", state: "coming", itemsSummary: "Brake pads", rider: { name: "Blessing Moyo", phone: null, bikeReg: "AFG 2231" }, expiresAt: null }),
      merchantBooking({ id: "gone", state: "cancelled", itemsSummary: "A re-sent booking", rebroadcastedToId: "live" }),
    ]);
    render(<Page />);
    expect(await screen.findByText("Mbare Auto Spares")).toBeTruthy();
    expect(await screen.findByText("Car battery · 3 riders offered")).toBeTruthy();
    expect(screen.queryByText("Sales")).toBeNull();
    expect(screen.getByRole("link", { name: /Book a rider/ }).getAttribute("href")).toBe("/deliveries/new");
    const needs = screen.getByRole("region", { name: "NEEDS YOU" });
    expect(within(needs).getByText("Car battery · 3 riders offered")).toBeTruthy();
    expect(within(needs).getByText("Pick one before the offers expire")).toBeTruthy();
    expect(within(needs).getByText(/^1:0\d$/)).toBeTruthy();
    expect(within(needs).getByText("Blessing M. is coming to your counter")).toBeTruthy();
    expect(screen.queryByText("A re-sent booking")).toBeNull();
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("deliveries");
  });

  it("MJ-RM4: a booking that ended today draws no card, so the empty state shows instead of a blank page", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([
      merchantBooking({ id: "ended", state: "cancelled", cancelledBy: "business", itemsSummary: "Car battery", createdAt: new Date(Date.now() - 3600_000).toISOString() }),
    ]);
    render(<Page />);
    expect(await screen.findByText("No riders booked yet")).toBeTruthy();
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

  describe("keeping the list live (MJ-RL25, MJ-RM6, MJ-RL26)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function mounted() {
      vi.useFakeTimers();
      render(<Page />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const finding = () => merchantBooking({ id: "live", state: "finding", itemsSummary: "Car battery", offerCount: 3, expiresAt: new Date(Date.now() + 62_000).toISOString() });

    it("reads the business once, then polls only the live bookings while a rider is being found", async () => {
      vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
      vi.mocked(listBookings).mockResolvedValue([finding()]);
      await mounted();
      expect(screen.getByText("Car battery · 3 riders offered")).toBeTruthy();
      expect(vi.mocked(listBookings).mock.calls).toEqual([[]]);

      await advance(3_000);
      await advance(3_000);
      expect(getMerchantProfile).toHaveBeenCalledTimes(1);
      expect(vi.mocked(listBookings).mock.calls).toEqual([[], [{ live: true }], [{ live: true }]]);
    });

    it("with nothing live, still polls every 30 s, so a teammate's booking shows without a reload", async () => {
      vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
      vi.mocked(listBookings).mockResolvedValue([]);
      await mounted();
      expect(screen.getByText("No riders booked yet")).toBeTruthy();

      // The owner books one from their own phone.
      vi.mocked(listBookings).mockResolvedValue([finding()]);
      await advance(29_000);
      expect(listBookings).toHaveBeenCalledTimes(1);
      await advance(1_000);
      // The live read brings the new booking, and it is added to the list (no second, full read).
      expect(vi.mocked(listBookings).mock.calls).toEqual([[], [{ live: true }]]);
      expect(screen.getByText("Car battery · 3 riders offered")).toBeTruthy();
    });

    it("re-reads the list when the tab comes back to the front", async () => {
      vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
      vi.mocked(listBookings).mockResolvedValue([]);
      await mounted();
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(vi.mocked(listBookings).mock.calls).toEqual([[], []]);
      expect(getMerchantProfile).toHaveBeenCalledTimes(1);
    });
  });

  it("offers a retry when the list can't load", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: PIN }));
    vi.mocked(listBookings).mockRejectedValue(new Error("offline"));
    render(<Page />);
    expect(await screen.findByText("Couldn't load your deliveries.")).toBeTruthy();
  });
});
