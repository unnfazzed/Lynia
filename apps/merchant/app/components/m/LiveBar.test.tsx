// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantBookingResponse, MerchantProfileResponse } from "@lynia/shared";
import { LiveBar } from "./LiveBar";
import { useBookings } from "../../lib/use-bookings";
import { merchantBooking, merchantProfile } from "../../testing/fixtures";

const state = vi.hoisted(() => ({ business: null as MerchantProfileResponse | null, bookings: [] as MerchantBookingResponse[] }));
vi.mock("../KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ queue: { orders: [] } }) }));
vi.mock("../../lib/business", () => ({ useBusiness: () => state.business }));
vi.mock("../../lib/use-bookings", () => ({ useBookings: vi.fn(() => ({ bookings: state.bookings, loaded: true, error: null, reload: async () => {} })) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Mbare", contactPhone: "+263771234567" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.business = null;
  state.bookings = [];
});

describe("T1 · the live bar (MJ-RM5)", () => {
  it("a shop's riders' offers show on the other tabs and open that booking", () => {
    state.business = merchantProfile({ businessType: "shop", shopKind: "auto_parts", location: PIN });
    state.bookings = [
      merchantBooking({ id: "b1000000-0000-4000-8000-000000000000", state: "finding", itemsSummary: "Car battery", offerCount: 3, expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    ];
    render(<LiveBar />);
    expect(vi.mocked(useBookings)).toHaveBeenCalledWith(true);
    const bar = screen.getByRole("link");
    expect(bar.getAttribute("href")).toBe("/deliveries/booking?id=b1000000-0000-4000-8000-000000000000");
    expect(screen.getByText(/^Car battery · 3 riders offered · \d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Pick one before the offers expire")).toBeTruthy();
  });

  it("a restaurant doesn't read bookings, and nothing live hides the bar", () => {
    state.business = merchantProfile({ businessType: "restaurant", location: PIN });
    render(<LiveBar />);
    expect(vi.mocked(useBookings)).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
