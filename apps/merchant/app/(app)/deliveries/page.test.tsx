// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeliveriesPage from "./page";
import { listBookings } from "../../lib/bookings-api";
import { clearBusinessCache } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";
import { merchantBooking, merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn() }));
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

afterEach(() => {
  cleanup();
  clearBusinessCache();
  vi.clearAllMocks();
});

describe("Deliveries (merchant web upgrade L2)", () => {
  it("lists live bookings first, then earlier ones, and hides a booking Send already re-sent", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([
      merchantBooking({ id: "live", state: "finding", itemsSummary: "2 brake pads", offerCount: 2 }),
      merchantBooking({ id: "old", state: "delivered", itemsSummary: "An oil filter", expiresAt: null }),
      merchantBooking({ id: "gone", state: "cancelled", itemsSummary: "A re-sent booking", rebroadcastedToId: "live" }),
    ]);

    render(<DeliveriesPage />);

    const live = await screen.findByRole("region", { name: "Live deliveries" });
    expect(within(live).getByText("2 brake pads")).toBeTruthy();
    expect(within(live).getByText("2 offers")).toBeTruthy();
    const earlier = screen.getByRole("region", { name: "Earlier deliveries" });
    expect(within(earlier).getByText("An oil filter")).toBeTruthy();
    expect(screen.queryByText("A re-sent booking")).toBeNull();
    expect(screen.getByText("Open a booking to see riders' offers and pick one.")).toBeTruthy();
    // A shop's home: the Deliveries nav item is the active one, and its way out is here.
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("deliveries");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("opens with Book your first rider when there are none yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: PIN }));
    vi.mocked(listBookings).mockResolvedValue([]);

    render(<DeliveriesPage />);

    expect(await screen.findByText("Book your first rider")).toBeTruthy();
    for (const link of screen.getAllByRole("link", { name: "Book a rider" })) expect(link.getAttribute("href")).toBe("/deliveries/new");
    // A restaurant reaches Deliveries from Orders, which stays its active nav item (and keeps its Sign out).
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("queue");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("says booking is on its way, and offers nothing, on an API that can't book riders yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop" }));

    render(<DeliveriesPage />);

    expect(await screen.findByText("Booking riders is on its way.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Book a rider" })).toBeNull();
    expect(listBookings).not.toHaveBeenCalled();
  });

  it("offers a retry when the list can't load", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: PIN }));
    vi.mocked(listBookings).mockRejectedValue(new Error("offline"));

    render(<DeliveriesPage />);

    expect(await screen.findByText("Couldn't load your deliveries.")).toBeTruthy();
  });
});
