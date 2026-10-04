// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewBookingPage from "./page";
import { ApiError } from "../../../lib/api-client";
import { VALUE_CAP_MESSAGE } from "../../../lib/booking";
import { createBooking, resolveMapLink } from "../../../lib/bookings-api";
import { clearBusinessCache } from "../../../lib/business";
import { getMerchantProfile, listDishes } from "../../../lib/menu-api";
import { resolvePlace, searchPlaces } from "../../../lib/places";
import { merchantBooking, merchantProfile } from "../../../testing/fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace: nav.replace, push: vi.fn() };
  return { useRouter: () => router };
});

vi.mock("../../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), listDishes: vi.fn(async () => []) }));
vi.mock("../../../lib/places", () => ({ newSessionToken: () => "s", searchPlaces: vi.fn(async () => []), resolvePlace: vi.fn() }));
vi.mock("../../../lib/bookings-api", () => ({ createBooking: vi.fn(), resolveMapLink: vi.fn() }));

vi.mock("../../../components/KitchenConnectionProvider", () => {
  const value = { signOut: vi.fn(), actionsDisabled: false };
  return { useKitchenConnection: () => value };
});

vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div data-testid="kitchen-shell">{children}</div>,
}));

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Opposite Mbare market", contactPhone: "+263771234567" };
const DISH = { id: "d1000000-0000-4000-8000-000000000000", categoryId: "c1", name: "Brake pads (front)", description: null, priceUsd: 22, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: 0 };

afterEach(() => {
  cleanup();
  clearBusinessCache();
  vi.clearAllMocks();
});

async function openForm(overrides: Parameters<typeof merchantProfile>[0] = {}) {
  vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", shopKind: "auto_parts", location: PIN, ...overrides }));
  render(<NewBookingPage />);
  await screen.findByText("Going to");
}

const search = () => screen.getByLabelText("Search street or area, or paste the buyer's location");
function type(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

/** "Going to" by a pasted location, and the buyer's number (S4 is one screen). */
async function fillWhere(where = "-17.8, 31.05") {
  type(search(), where);
  type(screen.getByLabelText("Buyer’s phone"), "0779982210");
  await screen.findByText("Pin the buyer sent");
}

/** "+ Add" → "Type one" → the typed item. */
function addTyped(name: string, price: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Your items" })).getByRole("button", { name: "Type one" }));
  const sheet = screen.getByRole("dialog", { name: "Type an item" });
  type(within(sheet).getByLabelText("What it is"), name);
  type(within(sheet).getByLabelText("Price of one ($)"), price);
  fireEvent.click(within(sheet).getByRole("button", { name: "Add" }));
}

describe("S4 · Book a rider, one screen (Merchant v2, D-77) — where", () => {
  it("won't book without somewhere to go and the buyer's number", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    expect(await screen.findByText("Search for the buyer's street, or paste the location they sent.")).toBeTruthy();
    expect(screen.getByText("Enter the buyer's number, like 77 123 4567.")).toBeTruthy();
  });

  it("searches places, and the picked place becomes the mint 'Going to' pill", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([
      { placeId: "p1", primary: "12 Fife Ave", secondary: "Avondale, Harare" },
      { placeId: "p2", primary: "Fife Ave", secondary: "Harare CBD" },
    ]);
    vi.mocked(resolvePlace).mockResolvedValue({ point: { lat: -17.8, lng: 31.04 }, address: "12 Fife Ave" });
    await openForm();
    type(search(), "Fife Ave");
    fireEvent.click(await screen.findByRole("button", { name: /12 Fife Ave/ }));
    const pill = await screen.findByRole("button", { name: "Going to 12 Fife Ave, Avondale, Harare. Change it" });
    expect(screen.getByLabelText("Buyer’s phone")).toBeTruthy();
    fireEvent.click(pill);
    expect(search()).toBeTruthy();
  });

  it("asks the API to follow a Google Maps short link, and says so plainly when it can't", async () => {
    vi.mocked(resolveMapLink).mockResolvedValueOnce({ lat: -17.81, lng: 31.06 });
    await openForm();
    type(search(), "Here: https://maps.app.goo.gl/AbC123");
    expect(screen.getByText("Reading the link…")).toBeTruthy();
    expect(await screen.findByText("Pin the buyer sent")).toBeTruthy();
    expect(resolveMapLink).toHaveBeenCalledWith("https://maps.app.goo.gl/AbC123");

    fireEvent.click(screen.getByRole("button", { name: "Going to Pin the buyer sent. Change it" }));
    vi.mocked(resolveMapLink).mockRejectedValueOnce(new ApiError(422, "We couldn't read a location from that link.", "unreadable_link"));
    type(search(), "https://maps.app.goo.gl/Nope");
    expect(await screen.findByText("We couldn't read a location from that link.")).toBeTruthy();
  });

  it("never lets an older link's late answer move the location", async () => {
    let answerOld: (p: { lat: number; lng: number }) => void = () => {};
    vi.mocked(resolveMapLink).mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
    await openForm();
    type(search(), "https://maps.app.goo.gl/Old");
    await waitFor(() => expect(resolveMapLink).toHaveBeenCalledTimes(1));
    await fillWhere("-17.8, 31.05");
    answerOld({ lat: -17.7, lng: 30.9 });
    addTyped("Oil filter", "7");
    vi.mocked(createBooking).mockResolvedValue(merchantBooking());
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(vi.mocked(createBooking).mock.calls[0]![0].dropoff.point).toEqual({ lat: -17.8, lng: 31.05 });
  });
});

describe("S4 · what's going + fare", () => {
  it("adds from your items and typed ones, sums the worth, steps the fare and books once with it all", async () => {
    vi.mocked(listDishes).mockResolvedValue([DISH]);
    vi.mocked(createBooking).mockResolvedValue(merchantBooking({ id: "b1" }));
    await openForm();
    await fillWhere();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(await within(await screen.findByRole("dialog", { name: "Your items" })).findByRole("button", { name: /Brake pads \(front\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(await within(await screen.findByRole("dialog", { name: "Your items" })).findByRole("button", { name: /Brake pads \(front\)/ }));
    addTyped("Oil filter", "7");

    expect(screen.getByText("What’s going · $51.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove 2× Brake pads (front)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove 1× Oil filter" })).toBeTruthy();
    const find = screen.getByRole("button", { name: /^Find a rider · \$\d+\.\d\d$/ });
    const before = Number(find.textContent!.split("$")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Offer $0.50 more" }));
    expect(screen.getByRole("button", { name: `Find a rider · $${(before + 0.5).toFixed(2)}` })).toBeTruthy();

    const go = screen.getByRole("button", { name: /^Find a rider/ });
    fireEvent.click(go);
    fireEvent.click(go);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/b1"));
    expect(createBooking).toHaveBeenCalledTimes(1);
    const body = vi.mocked(createBooking).mock.calls[0]![0];
    expect(body.items).toEqual([
      { description: "Brake pads (front)", quantity: 2 },
      { description: "Oil filter", quantity: 1 },
    ]);
    expect(body.declaredValue).toBe(51);
    expect(body.proposedFare).toBe(before + 0.5);
    expect(body.dropoff).toMatchObject({ point: { lat: -17.8, lng: 31.05 }, contactPhone: "+263779982210" });
  });

  it("the buyer can pay cash on delivery: the booking asks the rider to bring the worth back", async () => {
    vi.mocked(createBooking).mockResolvedValue(merchantBooking({ id: "b2" }));
    await openForm();
    await fillWhere();
    addTyped("Oil filter", "7");
    expect(screen.getByText("and brings it back to you")).toBeTruthy();
    const sw = screen.getByRole("switch", { name: "Rider collects $7.00" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(vi.mocked(createBooking).mock.calls[0]![0]).toMatchObject({ collectCash: true, declaredValue: 7 });
  });

  it("books nothing without items, and blocks goods over $150", async () => {
    await openForm();
    await fillWhere();
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    expect(await screen.findByText("Add what's going: from your items, or type one.")).toBeTruthy();
    addTyped("Engine", "200");
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    expect(await screen.findByText(VALUE_CAP_MESSAGE)).toBeTruthy();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("shows the API's refusal, like a business on hold, without leaving the form", async () => {
    vi.mocked(createBooking).mockRejectedValue(new ApiError(403, "Bookings for this business are on hold. Message LyniaGo.", "business_on_hold"));
    await openForm();
    await fillWhere();
    addTyped("Oil filter", "7");
    fireEvent.click(screen.getByRole("button", { name: /^Find a rider/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Bookings for this business are on hold. Message LyniaGo.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("Booking terms: a pharmacy is told over-the-counter only, everyone about prohibited goods and no cash-on-delivery", async () => {
    await openForm({ shopKind: "pharmacy" });
    fireEvent.click(screen.getByRole("button", { name: "Booking terms" }));
    expect(screen.getByText("No prescription medicine, weapons, drugs or cash. Over-the-counter items only.")).toBeTruthy();
    expect(screen.getByText("No cash-on-delivery: the rider collects nothing from the buyer. The buyer pays you as they do today.")).toBeTruthy();
  });
});

describe("the gate", () => {
  it("has no form for a business without a pin, and sends everyone back when the API can't book yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: null }));
    render(<NewBookingPage />);
    expect(await screen.findByText("Set your shop's location first, so riders know where to collect.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Find a rider/ })).toBeNull();

    cleanup();
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile());
    render(<NewBookingPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries"));
  });
});
