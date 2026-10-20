// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import { ApiError } from "../../../lib/api-client";
import { cancelBooking, closeBookingCash, getBooking, pickOffer, retryBooking, rotateBookingCode } from "../../../lib/bookings-api";
import { bookingOffer, merchantBooking } from "../../../testing/fixtures";

const ID = "11111111-1111-4111-8111-111111111111";

const nav = vi.hoisted(() => ({ replace: vi.fn(), id: "11111111-1111-4111-8111-111111111111" }));
vi.mock("next/navigation", () => {
  const router = { replace: nav.replace, push: vi.fn() };
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams({ id: nav.id }) };
});

vi.mock("../../../lib/bookings-api", () => ({
  closeBookingCash: vi.fn(),
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
  nav.id = ID;
});

describe("D4 · Pick a biker (merchant mobile, D-48)", () => {
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

  it("shows no Preferred biker tag (retired) and sorts by cheapest or closest", async () => {
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
    expect(picks).toHaveLength(2);
    expect(picks[0]!.className).toBe("m-btn");
    expect(picks[1]!.className).toBe("m-gh");
    expect(screen.queryByText("Preferred biker")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Cheapest" }));
    expect(screen.getAllByRole("button", { name: /^Pick / }).map((b) => b.textContent)).toEqual(["Pick Blessing", "Pick Tino"]);
    fireEvent.click(screen.getByRole("tab", { name: "Closest" }));
    expect(screen.getAllByRole("button", { name: /^Pick / }).map((b) => b.textContent)).toEqual(["Pick Tino", "Pick Blessing"]);
  });

  it("picking a biker goes to tracking with the buyer's code, kept in this browser, sent on WhatsApp", async () => {
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
      "Hi, it's Mbare Auto Spares. Blessing Moyo (ABC 1234) is bringing your order. When it arrives, give the biker this code: 482915",
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

  it("MJ-RL3: a pick whose answer was lost went through — the reload shows the biker, with no stale error", async () => {
    vi.mocked(getBooking)
      .mockResolvedValueOnce(merchantBooking({ expiresAt: new Date(Date.now() + 80_000).toISOString(), offers: [bookingOffer()] }))
      .mockResolvedValue(merchantBooking({ state: "coming", status: "assigned", expiresAt: null, rider: RIDER, agreedFare: "3.50" }));
    vi.mocked(pickOffer).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick Blessing" }));
    expect(await screen.findByText("Biker coming to your shop")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Couldn't reach the server — check the connection and try again.")).toBeNull());
    // No code came back, so a new one is a tap away.
    expect(screen.getByRole("button", { name: "Get a new code" })).toBeTruthy();
  });
});

describe("D5 · Tracking", () => {
  it("a teammate without the code gets a new one, which replaces the old", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(rotateBookingCode).mockResolvedValue({ deliveryCode: "105377" });
    render(<Page />);
    expect(await screen.findByText("Biker coming to your shop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    // MJ-RL6: the buyer's code dies with it, so it asks first.
    expect(screen.getByText("The buyer's old code stops working.")).toBeTruthy();
    expect(rotateBookingCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Get new code" }));
    expect(await screen.findByLabelText("Buyer's code 1 0 5 3 7 7")).toBeTruthy();
    expect(await screen.findByText("New code · send it to the buyer")).toBeTruthy();
  });

  it("MJ-RL6: Keep leaves the buyer's code alone", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    render(<Page />);
    expect(await screen.findByText("Biker coming to your shop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Keep" }).at(-1)!);
    expect(screen.queryByText("The buyer's old code stops working.")).toBeNull();
    expect(rotateBookingCode).not.toHaveBeenCalled();
  });

  it("K5: Step 3 of 5 while the biker comes, and cancels before pickup behind the confirm sheet", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "coming", expiresAt: null, rider: RIDER }));
    vi.mocked(cancelBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "business" }));
    render(<Page />);
    expect(await screen.findByLabelText("3 of 5 steps")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByText("The biker is told. You can book again any time.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel booking" }).at(-1)!);
    expect(await screen.findByText("Booking cancelled", { selector: "b" })).toBeTruthy();
    expect(cancelBooking).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("button", { name: "Try again · $3.50" })).toBeTruthy();
  });

  it("once picked up, reads On the way to buyer and can't be cancelled here", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "picked_up", expiresAt: null, rider: RIDER }));
    render(<Page />);
    expect(await screen.findByText("On the way to buyer")).toBeTruthy();
    expect(screen.getByLabelText("4 of 5 steps")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });
});

describe("D7 · Delivered", () => {
  it("K5 at Step 5 of 5: says so, names the biker and what went, no code, and offers to book again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "delivered", expiresAt: null, rider: RIDER, itemsSummary: "2× Brake pads (front) · 1× Oil filter", agreedFare: "3.50" }));
    render(<Page />);
    expect(await screen.findByText("Delivered")).toBeTruthy();
    expect(screen.getByText("Blessing M. · 2× Brake pads (front) · 1× Oil filter")).toBeTruthy();
    expect(screen.getByLabelText("5 of 5 steps")).toBeTruthy();
    expect(screen.queryByText("BUYER’S CODE")).toBeNull();
    expect(screen.getByRole("link", { name: "Book again" }).getAttribute("href")).toBe("/deliveries/new");
  });
});

describe("D7 · cash back to you (D-48 PR 4b)", () => {
  const due = () =>
    merchantBooking({
      state: "delivered",
      expiresAt: null,
      rider: RIDER,
      agreedFare: "3.50",
      cashOnDelivery: { amount: "51.00", status: "due", dueAt: new Date(Date.now() + 22 * 60_000).toISOString() },
    });

  it("OB-M13 (Own bikers, D-117): a phone booking carried by the shop's own biker reads 'Cash back from Blessing: $51.00'", async () => {
    vi.mocked(getBooking).mockResolvedValue({ ...due(), ownBiker: true });
    render(<Page />);
    expect(await screen.findByText("Cash back from Blessing: $51.00")).toBeTruthy();
    expect(screen.queryByText("Delivery $3.50 · biker's")).toBeNull();
  });

  it("says who is bringing how much and by when; 'I got $51.00' closes it", async () => {
    vi.mocked(getBooking).mockResolvedValue(due());
    vi.mocked(closeBookingCash).mockResolvedValue(merchantBooking({ state: "delivered", expiresAt: null, rider: RIDER, cashOnDelivery: { amount: "51.00", status: "returned", dueAt: null } }));
    render(<Page />);
    expect(await screen.findByText("CASH BACK TO YOU")).toBeTruthy();
    expect(screen.getByText(/^Blessing brings it back by \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Goods $51.00")).toBeTruthy();
    expect(screen.getByText("Delivery $3.50 · biker's")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Book again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I got $51.00" }));
    await waitFor(() => expect(closeBookingCash).toHaveBeenCalledWith(ID, "returned"));
    expect(await screen.findByText("Cash confirmed · delivery closed")).toBeTruthy();
    expect(screen.queryByText("CASH BACK TO YOU")).toBeNull();
    expect(screen.getByRole("link", { name: "Book again" })).toBeTruthy();
  });

  it("'No cash on this one' closes it after a neutral confirm", async () => {
    vi.mocked(getBooking).mockResolvedValue(due());
    vi.mocked(closeBookingCash).mockResolvedValue(merchantBooking({ state: "delivered", expiresAt: null, cashOnDelivery: { amount: "51.00", status: "closed", dueAt: null } }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "No cash on this one · mark completed" }));
    expect(screen.getByText("Nothing will show as owed for this delivery.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close delivery" }));
    await waitFor(() => expect(closeBookingCash).toHaveBeenCalledWith(ID, "no_cash"));
  });

  it("before delivery the cash card shows and 'I got $51.00' is held until after delivery", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "picked_up", expiresAt: null, rider: RIDER, cashOnDelivery: { amount: "51.00", status: "awaiting_delivery", dueAt: null } }));
    render(<Page />);
    expect(await screen.findByText("Blessing brings it back after delivery")).toBeTruthy();
    expect((screen.getByRole("button", { name: "I got $51.00 · after delivery" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the other endings", () => {
  it("No biker picked in time: Try again, with a higher fare if the booker wants", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "expired", expiresAt: null }));
    vi.mocked(retryBooking).mockResolvedValue(merchantBooking({ id: "44444444-4444-4444-8444-444444444444" }));
    render(<Page />);
    expect(await screen.findByText("No biker picked in time")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Offer $0.50 more" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again · $4.00" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/booking?id=44444444-4444-4444-8444-444444444444"));
    expect(vi.mocked(retryBooking).mock.calls[0]![1]).toMatchObject({ proposedFare: 4 });
  });

  it("MJ-RM3: a second Try again, on the booking the first one made, sends its own retry key", async () => {
    const ID2 = "44444444-4444-4444-8444-444444444444";
    vi.mocked(getBooking).mockImplementation(async (id: string) => merchantBooking({ id, state: "expired", expiresAt: null }));
    vi.mocked(retryBooking).mockResolvedValueOnce(merchantBooking({ id: ID2 })).mockResolvedValueOnce(merchantBooking({ id: "55555555-5555-4555-8555-555555555555" }));
    const { rerender } = render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /^Try again/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/deliveries/booking?id=${ID2}`));
    // The router moves this same page to the new booking: only the query changes.
    nav.id = ID2;
    rerender(<Page />);
    await waitFor(() => expect(getBooking).toHaveBeenLastCalledWith(ID2));
    fireEvent.click(await screen.findByRole("button", { name: /^Try again/ }));
    await waitFor(() => expect(retryBooking).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(retryBooking).mock.calls;
    expect(first![0]).toBe(ID);
    expect(second![0]).toBe(ID2);
    expect(second![1].idempotencyKey).not.toBe(first![1].idempotencyKey);
  });

  it("a biker's cancel leads to Send's re-sent booking", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "rider", rebroadcastedToId: "55555555-5555-4555-8555-555555555555" }));
    render(<Page />);
    expect((await screen.findByRole("link", { name: /follow it/ })).getAttribute("href")).toBe("/deliveries/booking?id=55555555-5555-4555-8555-555555555555");
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("a LyniaGo team cancel says why and isn't offered again", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "cancelled", expiresAt: null, cancelledBy: "ops", cancelReason: "Safety concern" }));
    render(<Page />);
    expect(await screen.findByText("Cancelled by the LyniaGo team")).toBeTruthy();
    expect(screen.getByText("Safety concern")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("Not delivered names the biker's reason and lets the business call them", async () => {
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ state: "not_delivered", expiresAt: null, rider: RIDER, undeliveredReason: "unreachable" }));
    render(<Page />);
    expect(await screen.findByText(/The biker couldn't reach the buyer\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Call Blessing M\./ }).getAttribute("href")).toBe("tel:+263772222222");
  });
});
