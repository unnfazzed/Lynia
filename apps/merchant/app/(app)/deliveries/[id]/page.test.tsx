// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "./page";
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

const RIDER = { name: "Blessing", phone: "+263772222222", bikeReg: "ABC 1234" };

beforeEach(() => {
  // A live 90-second window, whatever the clock says.
  vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString() }));
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("One booking (merchant web upgrade L2)", () => {
  it("shows the countdown and every rider's offer, and a teammate's offer can't be picked", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      merchantBooking({
        expiresAt: new Date(Date.now() + 80_000).toISOString(),
        offers: [
          bookingOffer({ id: "o1", type: "counter", offeredFare: "4.00" }),
          bookingOffer({ id: "o2", rider: { name: "Tendai", photoUrl: null, ratingAvg: null, ratingCount: 0, tripsCount: 0 }, ownMember: true }),
        ],
      }),
    );
    render(<BookingPage />);

    expect(await screen.findByText("Stay here to pick a rider. Offers appear as riders respond.")).toBeTruthy();
    expect(screen.getByText(/^1:[0-2]\d$/)).toBeTruthy();
    expect(screen.getByText("their fare")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pick Blessing for $4.00" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Pick Tendai for $3.50" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("On your team, so they can't take your own delivery.")).toBeTruthy();
  });

  it("picking a rider shows the code once, keeps it in this browser, and sends it to the buyer on WhatsApp", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString(), offers: [bookingOffer()] }));
    vi.mocked(pickOffer).mockResolvedValue({
      booking: merchantBooking({ state: "coming", status: "assigned", expiresAt: null, rider: RIDER, agreedFare: "3.50" }),
      deliveryCode: "482910",
    });
    render(<BookingPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pick Blessing for $3.50" }));

    expect(await screen.findByLabelText("Delivery code 4 8 2 9 1 0")).toBeTruthy();
    expect(pickOffer).toHaveBeenCalledWith(ID, bookingOffer().id);
    expect(window.sessionStorage.getItem(`lynia_booking_code:${ID}`)).toBe("482910");
    const wa = screen.getByRole("link", { name: "Send the code to the buyer on WhatsApp" }).getAttribute("href")!;
    expect(wa.startsWith("https://wa.me/263771234567?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("?text=")[1]!)).toBe(
      "Hi, it's Mbare Auto Spares. Blessing (ABC 1234) is bringing your order. When it arrives, give the rider this code: 482910",
    );
    expect(screen.getByRole("link", { name: "Call rider" }).getAttribute("href")).toBe("tel:+263772222222");
    expect(screen.getByText("ABC 1234 · Pay $3.50 in cash at pickup")).toBeTruthy();
  });

  it("a teammate on another device gets a new code, which replaces the old one", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(rotateBookingCode).mockResolvedValue({ deliveryCode: "105377" });
    render(<BookingPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Get a new code" }));

    expect(await screen.findByLabelText("Delivery code 1 0 5 3 7 7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeTruthy();
  });

  it("cancels before pickup after a confirm, then offers to send it again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(cancelBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "business" }));
    render(<BookingPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(screen.getByText("There's no charge before pickup.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));

    expect(await screen.findByText("This booking was cancelled.")).toBeTruthy();
    expect(cancelBooking).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("can't be cancelled here once the rider has the goods", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "picked_up", expiresAt: null, rider: RIDER }));
    render(<BookingPage />);

    expect(await screen.findByText(/The rider has it now, so this booking can't be cancelled here/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(screen.getByRole("link", { name: "message LyniaGo" }).getAttribute("href")).toBe("https://wa.me/263770000000");
  });

  it("No rider picked in time: Try again with the same details, and a higher fare if the booker wants", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "expired", expiresAt: null }));
    vi.mocked(retryBooking).mockResolvedValue(merchantBooking({ id: "44444444-4444-4444-8444-444444444444" }));
    render(<BookingPage />);

    const fare = (await screen.findByLabelText("Fare you offer (US$)")) as HTMLInputElement;
    expect(fare.value).toBe("3.50");
    // Clearing the box to type a new fare doesn't refill it.
    fireEvent.change(fare, { target: { value: "" } });
    expect(fare.value).toBe("");
    fireEvent.change(fare, { target: { value: "4.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/44444444-4444-4444-8444-444444444444"));
    expect(vi.mocked(retryBooking).mock.calls[0]![1]).toMatchObject({ proposedFare: 4.5 });
  });

  it("a rider's cancel leads to Send's re-sent booking", async () => {
    vi.mocked(getBooking).mockResolvedValue(
      merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "rider", rebroadcastedToId: "55555555-5555-4555-8555-555555555555" }),
    );
    render(<BookingPage />);

    expect((await screen.findByRole("link", { name: "Follow the new booking" })).getAttribute("href")).toBe(
      "/deliveries/55555555-5555-4555-8555-555555555555",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a LyniaGo team cancel says why and isn't offered again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "ops", cancelReason: "Safety concern" }));
    render(<BookingPage />);

    expect(await screen.findByText("Cancelled by the LyniaGo team.")).toBeTruthy();
    expect(screen.getByText(/Safety concern/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("Not delivered names the rider's reason and lets the business call them", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "not_delivered", expiresAt: null, rider: RIDER, undeliveredReason: "unreachable" }));
    render(<BookingPage />);

    expect(await screen.findByText("The rider couldn't reach the buyer.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Call rider" }).getAttribute("href")).toBe("tel:+263772222222");
  });

  it("a refused pick says why and refetches, since the booking moved", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString(), offers: [bookingOffer()] }));
    vi.mocked(pickOffer).mockRejectedValue(new ApiError(409, "That offer is no longer available.", "offer_gone"));
    render(<BookingPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pick Blessing for $3.50" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That offer is no longer available.");
    await waitFor(() => expect(getBooking).toHaveBeenCalledTimes(2));
  });
});
