// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import { ApiError } from "../../../lib/api-client";
import { cancelBooking, getBooking, pickOffer, retryBooking, rotateBookingCode } from "../../../lib/bookings-api";
import { bookingOffer, merchantBooking } from "../../../testing/fixtures";

const ID = "11111111-1111-4111-8111-111111111111";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace: nav.replace, push: vi.fn() };
  return { useRouter: () => router, useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }) };
});

vi.mock("../../../lib/bookings-api", () => ({
  getBooking: vi.fn(),
  pickOffer: vi.fn(),
  cancelBooking: vi.fn(),
  rotateBookingCode: vi.fn(),
  retryBooking: vi.fn(),
}));

vi.mock("../../../lib/business", () => {
  const business = { id: "m1", name: "Mbare Auto Spares", businessType: "shop" };
  return { useBusiness: () => business };
});

vi.mock("../../../lib/config", () => ({ supportWhatsAppUrl: () => "https://wa.me/263770000000" }));

vi.mock("../../../components/KitchenConnectionProvider", () => {
  const value = { signOut: vi.fn(), actionsDisabled: false };
  return { useKitchenConnection: () => value };
});

vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div data-testid="kitchen-shell">{children}</div>,
}));

const RIDER = { name: "Blessing Moyo", phone: "+263772222222", bikeReg: "ABC 1234" };

const Page = () => (
  <ToastProvider>
    <BookingPage />
  </ToastProvider>
);

beforeEach(() => {
  // A live 90-second window, whatever the clock says.
  vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString() }));
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("D4 · Pick a rider (merchant mobile, D-48)", () => {
  it("shows the countdown, what was offered, every offer with its difference, and a teammate's offer can't be picked", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      merchantBooking({
        itemsSummary: "Car battery",
        proposedFare: "4.20",
        expiresAt: new Date(Date.now() + 80_000).toISOString(),
        offers: [
          bookingOffer({ id: "o1", type: "counter", offeredFare: "3.80", rider: { name: "Kuda Moyo", photoUrl: null, ratingAvg: 4.7, ratingCount: 9, tripsCount: 150 } }),
          bookingOffer({ id: "o2", rider: { name: "Tendai", photoUrl: null, ratingAvg: null, ratingCount: 0, tripsCount: 0 }, ownMember: true }),
        ],
      }),
    );
    render(<Page />);
    expect(await screen.findByText(/^1:[0-2]\d$/)).toBeTruthy();
    expect(screen.getByText(/Car battery → Blue gate opposite the church · you offered/)).toBeTruthy();
    expect(screen.getByText("$0.40 less")).toBeTruthy();
    expect(screen.getByText("★ 4.7 · 150 trips · 6 min away")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pick Kuda" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Pick Tendai" })).toBeNull();
    expect(screen.getByText("On your team, so they can't take your own delivery.")).toBeTruthy();
  });

  it("puts the business's own rider on top as the Preferred rider, and sorts by cheapest or closest", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      merchantBooking({
        expiresAt: new Date(Date.now() + 80_000).toISOString(),
        offers: [
          bookingOffer({ id: "o1", offeredFare: "3.00", etaMinutes: 9 }),
          bookingOffer({ id: "o2", offeredFare: "3.80", etaMinutes: 2, rider: { name: "Tino", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120 }, preferred: true }),
        ],
      }),
    );
    render(<Page />);
    const picks = await screen.findAllByRole("button", { name: /^Pick / });
    expect(picks.map((b) => b.textContent)).toEqual(["Pick Tino", "Pick Blessing"]);
    expect(picks[0]!.className).toBe("m-btn");
    expect(picks[1]!.className).toBe("m-gh");
    expect(screen.getByText("Preferred rider")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Cheapest" }));
    expect(screen.getAllByRole("button", { name: /^Pick / }).map((b) => b.textContent)).toEqual(["Pick Blessing", "Pick Tino"]);
  });

  it("picking a rider goes to tracking with the buyer's code, kept in this browser, sent on WhatsApp", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString(), offers: [bookingOffer()] }));
    vi.mocked(pickOffer).mockResolvedValue({
      booking: merchantBooking({ state: "coming", status: "assigned", expiresAt: null, rider: RIDER, agreedFare: "3.50" }),
      deliveryCode: "482915",
    });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick Blessing" }));
    expect(await screen.findByLabelText("Buyer's code 4 8 2 9 1 5")).toBeTruthy();
    expect(screen.getByText("482 915")).toBeTruthy();
    expect(pickOffer).toHaveBeenCalledWith(ID, bookingOffer().id);
    expect(window.sessionStorage.getItem(`lynia_booking_code:${ID}`)).toBe("482915");
    const wa = screen.getByRole("link", { name: "Send to buyer" }).getAttribute("href")!;
    expect(wa.startsWith("https://wa.me/263771234567?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("?text=")[1]!)).toBe(
      "Hi, it's Mbare Auto Spares. Blessing Moyo (ABC 1234) is bringing your order. When it arrives, give the rider this code: 482915",
    );
    expect(screen.getByRole("link", { name: "Call Blessing M." }).getAttribute("href")).toBe("tel:+263772222222");
  });

  it("a refused pick says why and refetches, since the booking moved", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString(), offers: [bookingOffer()] }));
    vi.mocked(pickOffer).mockRejectedValue(new ApiError(409, "That offer is no longer available.", "offer_gone"));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick Blessing" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That offer is no longer available.");
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
  });
});

describe("D5 · Tracking", () => {
  it("a teammate without the code gets a new one, which replaces the old", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(rotateBookingCode).mockResolvedValue({ deliveryCode: "105377" });
    render(<Page />);
    expect(await screen.findByText("Rider coming to your shop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    expect(await screen.findByLabelText("Buyer's code 1 0 5 3 7 7")).toBeTruthy();
    expect(await screen.findByText("New code · the old one stops working")).toBeTruthy();
  });

  it("shows the steps, and cancels before pickup behind the confirm sheet", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(cancelBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "business" }));
    render(<Page />);
    expect(await screen.findByText("Rider at your shop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByText("The rider is told. You can book again any time.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!);
    expect(await screen.findByText("Booking cancelled", { selector: "b" })).toBeTruthy();
    expect(cancelBooking).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("button", { name: "Try again · $3.50" })).toBeTruthy();
  });

  it("once picked up, reads On the way to buyer and can't be cancelled here", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "picked_up", expiresAt: null, rider: RIDER }));
    render(<Page />);
    expect(await screen.findByText("On the way to buyer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("href")).toBe("https://wa.me/263770000000");
  });
});

describe("D7 · Delivered", () => {
  it("says so, lists what went and the fare, and offers to book again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "delivered", expiresAt: null, rider: RIDER, itemsSummary: "2× Brake pads (front) · 1× Oil filter", agreedFare: "3.50" }));
    render(<Page />);
    expect(await screen.findByText("Buyer gave the rider the code")).toBeTruthy();
    expect(screen.getByText("Oil filter")).toBeTruthy();
    expect(screen.getByText("Fare to Blessing M.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /6 of 6 steps done/ }));
    expect(screen.getByText("Rider at your shop")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book again" }).getAttribute("href")).toBe("/deliveries/new");
  });
});

describe("the other endings", () => {
  it("No rider picked in time: Try again, with a higher fare if the booker wants", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "expired", expiresAt: null }));
    vi.mocked(retryBooking).mockResolvedValue(merchantBooking({ id: "44444444-4444-4444-8444-444444444444" }));
    render(<Page />);
    expect(await screen.findByText("No rider picked in time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Offer $0.50 more" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again · $4.00" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/44444444-4444-4444-8444-444444444444"));
    expect(vi.mocked(retryBooking).mock.calls[0]![1]).toMatchObject({ proposedFare: 4 });
  });

  it("a rider's cancel leads to Send's re-sent booking", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "rider", rebroadcastedToId: "55555555-5555-4555-8555-555555555555" }));
    render(<Page />);
    expect((await screen.findByRole("link", { name: /follow it/ })).getAttribute("href")).toBe("/deliveries/55555555-5555-4555-8555-555555555555");
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("a LyniaGo team cancel says why and isn't offered again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "ops", cancelReason: "Safety concern" }));
    render(<Page />);
    expect(await screen.findByText("Cancelled by the LyniaGo team")).toBeTruthy();
    expect(screen.getByText("Safety concern")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("Not delivered names the rider's reason and lets the business call them", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "not_delivered", expiresAt: null, rider: RIDER, undeliveredReason: "unreachable" }));
    render(<Page />);
    expect(await screen.findByText(/The rider couldn't reach the buyer\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Call Blessing M\./ }).getAttribute("href")).toBe("tel:+263772222222");
  });
});
