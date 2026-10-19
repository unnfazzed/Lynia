// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewBookingPage from "./page";
import { ApiError } from "../../../lib/api-client";
import { VALUE_CAP_MESSAGE } from "../../../lib/booking";
import { cancelBooking, createBooking, getBooking, resolveMapLink } from "../../../lib/bookings-api";
import { createFleetBooking, getFleet, sendFleetBookingToAny } from "../../../lib/fleet-api";
import { clearBusinessCache } from "../../../lib/business";
import { getMerchantProfile, listDishes } from "../../../lib/menu-api";
import { placesEnabled, resolvePlace, reverseGeocode, searchPlaces } from "../../../lib/places";
import { merchantBooking, merchantProfile } from "../../../testing/fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => {
  const router = { replace: nav.replace, push: vi.fn() };
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams(nav.search) };
});
// Own bikers (OB-M8–M12): no fleet unless a test sets one (the API answers 503 while it isn't live).
vi.mock("../../../lib/fleet-api", () => ({
  getFleet: vi.fn(async () => {
    throw new Error("Own bikers isn't live");
  }),
  createFleetBooking: vi.fn(),
  retryFleetBooking: vi.fn(),
  sendFleetBookingToAny: vi.fn(),
}));

vi.mock("../../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), listDishes: vi.fn(async () => []) }));
vi.mock("../../../lib/places", () => ({
  placesEnabled: vi.fn(() => true),
  newSessionToken: () => "s",
  searchPlaces: vi.fn(async () => []),
  resolvePlace: vi.fn(),
  reverseGeocode: vi.fn(async () => null),
  pinnedLine: (area?: string | null) => (area ? `Pin the buyer sent · ${area}` : "Pin the buyer sent"),
}));
vi.mock("../../../lib/bookings-api", () => ({ createBooking: vi.fn(), resolveMapLink: vi.fn(), getBooking: vi.fn(), cancelBooking: vi.fn() }));

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
  vi.mocked(placesEnabled).mockReturnValue(true);
  nav.search = "";
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

describe("S4 · Book a biker, one screen (Merchant v2, D-77) — where", () => {
  it("won't book without somewhere to go and the buyer's number", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
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

  it("names a pasted pin's area once the reverse lookup answers (S4, D-77)", async () => {
    vi.mocked(reverseGeocode).mockResolvedValueOnce({ point: { lat: -17.83, lng: 31.05 }, address: "Copacabana", area: "Copacabana" });
    await openForm();
    type(search(), "-17.83, 31.05");
    expect(await screen.findByText("Pin the buyer sent · Copacabana")).toBeTruthy();
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: -17.83, lng: 31.05 });
  });

  it("asks the API to follow a Google Maps short link, and says so plainly when it can't", async () => {
    vi.mocked(resolveMapLink).mockResolvedValueOnce({ lat: -17.81, lng: 31.06 });
    await openForm();
    type(search(), "Here: https://maps.app.goo.gl/AbC123");
    expect(screen.getByText("Reading the link…")).toBeTruthy();
    expect(await screen.findByText("Pin the buyer sent")).toBeTruthy();
    expect(resolveMapLink).toHaveBeenCalledWith("https://maps.app.goo.gl/AbC123");

    fireEvent.click(screen.getByRole("button", { name: "Going to Pin the buyer sent. Change it" }));
    vi.mocked(resolveMapLink).mockRejectedValueOnce(new ApiError(422, "We couldn't read a location from that link. Drop a pin instead.", "unreadable_link"));
    type(search(), "https://maps.app.goo.gl/Nope");
    // MJ-M15: the screen's own line — the server's used to name a pin control that doesn't exist.
    expect(await screen.findByText("We couldn't read a location from that link. Search for the street instead.")).toBeTruthy();
    expect(screen.queryByText(/Drop a pin/)).toBeNull();
  });

  it("MJ-M15: with no address search (no Places key), typing says to paste the buyer's location, and a bad link doesn't send them to a search", async () => {
    vi.mocked(placesEnabled).mockReturnValue(false);
    await openForm();
    type(search(), "Fife Ave");
    expect(await screen.findByText("Paste the location the buyer sent you, like a Google Maps or WhatsApp location link.")).toBeTruthy();
    vi.mocked(resolveMapLink).mockRejectedValueOnce(new ApiError(422, "We couldn't read a location from that link.", "unreadable_link"));
    type(search(), "https://maps.app.goo.gl/Nope");
    expect(await screen.findByText("We couldn't read a location from that link. Ask the buyer to send their location again.")).toBeTruthy();
    expect(screen.queryByText(/Search for the street/)).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
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
    const find = screen.getByRole("button", { name: /^Find a biker · \$\d+\.\d\d$/ });
    const before = Number(find.textContent!.split("$")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Offer $0.50 more" }));
    expect(screen.getByRole("button", { name: `Find a biker · $${(before + 0.5).toFixed(2)}` })).toBeTruthy();

    const go = screen.getByRole("button", { name: /^Find a biker/ });
    fireEvent.click(go);
    fireEvent.click(go);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/booking?id=b1"));
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

  it("the buyer can pay cash on delivery: the booking asks the biker to bring the worth back", async () => {
    vi.mocked(createBooking).mockResolvedValue(merchantBooking({ id: "b2" }));
    await openForm();
    await fillWhere();
    addTyped("Oil filter", "7");
    expect(screen.getByText("and brings it back to you")).toBeTruthy();
    const sw = screen.getByRole("switch", { name: "Biker collects $7.00" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(vi.mocked(createBooking).mock.calls[0]![0]).toMatchObject({ collectCash: true, declaredValue: 7 });
  });

  it("books nothing without items, and blocks goods over $150", async () => {
    await openForm();
    await fillWhere();
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    expect(await screen.findByText("Add what's going: from your items, or type one.")).toBeTruthy();
    addTyped("Engine", "200");
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    expect(await screen.findByText(VALUE_CAP_MESSAGE)).toBeTruthy();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("shows the API's refusal, like a business on hold, without leaving the form", async () => {
    vi.mocked(createBooking).mockRejectedValue(new ApiError(403, "Bookings for this business are on hold. Message LyniaGo.", "business_on_hold"));
    await openForm();
    await fillWhere();
    addTyped("Oil filter", "7");
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Bookings for this business are on hold. Message LyniaGo.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows no booking-terms UI: Send's terms are part of the T&C accepted at sign-up (D-77 follow-ups)", async () => {
    await openForm({ shopKind: "pharmacy" });
    expect(screen.queryByRole("button", { name: "Booking terms" })).toBeNull();
  });
});

describe("MJ-RL5 (not a bug): one key per form, edits included", () => {
  it("re-sends the first key after a lost answer even when the form changed, so a booking that did land is not doubled", async () => {
    vi.mocked(createBooking)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(merchantBooking({ id: "b9" }));
    await openForm();
    await fillWhere();
    addTyped("Oil filter", "7");
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");
    await waitFor(() => expect((screen.getByRole("button", { name: /^Find a biker/ }) as HTMLButtonElement).disabled).toBe(false));
    // The first attempt may have landed: a new key here would book a second rider.
    fireEvent.click(screen.getByRole("button", { name: "Offer $0.50 more" }));
    fireEvent.click(screen.getByRole("button", { name: /^Find a biker/ }));
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(2));
    const keys = vi.mocked(createBooking).mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("b9")));
  });
});

describe("MJ-RL8: Your items when the list doesn't load", () => {
  it("says it couldn't load them (not 'No items yet.') and Try again reads them again", async () => {
    vi.mocked(listDishes).mockRejectedValueOnce(new ApiError(0, "offline")).mockResolvedValueOnce([DISH]);
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const sheet = await screen.findByRole("dialog", { name: "Your items" });
    expect(await within(sheet).findByText("Couldn't load your items.")).toBeTruthy();
    expect(within(sheet).queryByText("No items yet.")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(await within(sheet).findByRole("button", { name: /Brake pads \(front\)/ })).toBeTruthy();
    expect(listDishes).toHaveBeenCalledTimes(2);
  });

  it("keeps 'No items yet.' for a real empty list", async () => {
    vi.mocked(listDishes).mockResolvedValueOnce([]);
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const sheet = await screen.findByRole("dialog", { name: "Your items" });
    expect(await within(sheet).findByText("No items yet.")).toBeTruthy();
    expect(within(sheet).queryByText("Couldn't load your items.")).toBeNull();
  });
});

describe("the gate", () => {
  it("has no form for a business without a pin, and sends everyone back when the API can't book yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: null }));
    render(<NewBookingPage />);
    expect(await screen.findByText("Set your shop's location first, so bikers know where to collect.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Find a biker/ })).toBeNull();

    cleanup();
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile());
    render(<NewBookingPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries"));
  });
});

describe("OB-M8–M12 · My bikers (own-bikers-v1, D-117)", () => {
  const biker = (state: "online" | "on_a_job" | "offline", i: number) => ({
    riderId: `00000000-0000-4000-8000-00000000000${i}`,
    name: `Biker ${i}`,
    phone: "+263 77 000 0000",
    homeBranch: "Avondale",
    state,
    joinedAt: "2026-10-01T00:00:00.000Z",
    cashHeld: null,
    cancelsThisWeek: 0,
  });
  function withFleet(over: Record<string, unknown> = {}) {
    vi.mocked(getFleet).mockResolvedValue({
      enabled: true,
      paused: false,
      role: "owner",
      bikers: [biker("on_a_job", 1), biker("online", 2), biker("online", 3), biker("offline", 4)],
      invites: [],
      suggestions: [],
      ...over,
    } as never);
  }
  const fleetBooking = (state: "ringing" | "none_took" | "none_online", over: Record<string, unknown> = {}) =>
    merchantBooking({ id: "fb1", state: "finding", fleet: { state, rung: 2, endsAt: new Date(Date.now() + 84_000).toISOString() }, ...over } as never);

  it("My bikers by default with the online count, no fare stepper, and Ring my bikers books it with no fare", async () => {
    withFleet();
    vi.mocked(createFleetBooking).mockResolvedValue({ booking: fleetBooking("ringing"), deliveryCode: "482910" });
    await openForm({ businessType: "restaurant" });
    const mine = await screen.findByRole("radio", { name: /My bikers · 2 online/ });
    expect(mine.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Fare you offer")).toBeNull();
    await fillWhere();
    addTyped("Quarter chicken", "6");
    fireEvent.click(screen.getByRole("button", { name: /Ring my bikers/ }));
    const sheet = await screen.findByRole("dialog", { name: "2 of your bikers online · ringing…" });
    expect(within(sheet).getByRole("progressbar").getAttribute("aria-label")).toMatch(/^1:2\d left$/);
    expect(within(sheet).getByText("The first to accept takes it.")).toBeTruthy();
    const body = vi.mocked(createFleetBooking).mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("proposedFare");
    expect(body).toMatchObject({ declaredValue: 6, items: [{ description: "Quarter chicken", quantity: 1 }] });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("nobody online: Any biker is chosen, the hint says 0 online, and it books as before", async () => {
    withFleet({ bikers: [biker("offline", 1)] });
    await openForm({ businessType: "restaurant" });
    expect((await screen.findByRole("radio", { name: "Any biker" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("0 of your bikers online")).toBeTruthy();
    await fillWhere();
    expect(screen.getByText("Fare you offer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Find a biker · \$/ })).toBeTruthy();
  });

  it("paused: My bikers is locked, the card says why with Contact LyniaGo, and Any biker works", async () => {
    withFleet({ paused: true });
    await openForm({ businessType: "restaurant" });
    expect(await screen.findByText("Own bikers paused")).toBeTruthy();
    expect(screen.getByText("Talk to LyniaGo to turn them back on.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /My bikers/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: "Any biker" }).getAttribute("aria-checked")).toBe("true");
    await fillWhere();
    expect(screen.getByText("Fare you offer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Find a biker · \$/ })).toBeTruthy();
  });

  it("none took it: Send to any biker opens Any biker with the fare, and sends that same booking", async () => {
    withFleet();
    vi.mocked(createFleetBooking).mockResolvedValue({ booking: fleetBooking("none_took"), deliveryCode: "482910" });
    vi.mocked(sendFleetBookingToAny).mockResolvedValue(merchantBooking({ id: "fb1" }));
    await openForm({ businessType: "restaurant" });
    await screen.findByRole("radio", { name: /My bikers/ });
    await fillWhere();
    addTyped("Quarter chicken", "6");
    fireEvent.click(screen.getByRole("button", { name: /Ring my bikers/ }));
    const result = await screen.findByRole("alertdialog", { name: "None of your bikers took it" });
    expect(within(result).getByText("We rang them 3 times over 2 minutes.")).toBeTruthy();
    expect(within(result).getByRole("button", { name: "Try my bikers again" })).toBeTruthy();
    fireEvent.click(within(result).getByRole("button", { name: "Send to any biker" }));
    expect(screen.getByText("Fare you offer")).toBeTruthy();
    const find = screen.getByRole("button", { name: /^Find a biker · \$/ });
    const fare = Number(find.textContent!.split("$")[1]);
    fireEvent.click(find);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/booking?id=fb1"));
    expect(sendFleetBookingToAny).toHaveBeenCalledWith("fb1", fare);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("nobody online when rung: the sheet says so; Cancel cancels the booking; Try my bikers again rings again", async () => {
    withFleet();
    vi.mocked(createFleetBooking).mockResolvedValue({ booking: fleetBooking("none_online"), deliveryCode: "482910" });
    vi.mocked(cancelBooking).mockResolvedValue(merchantBooking({ id: "fb1", state: "cancelled" } as never));
    await openForm({ businessType: "restaurant" });
    await screen.findByRole("radio", { name: /My bikers/ });
    await fillWhere();
    addTyped("Quarter chicken", "6");
    fireEvent.click(screen.getByRole("button", { name: /Ring my bikers/ }));
    const result = await screen.findByRole("alertdialog", { name: "None of your bikers are online" });
    expect(within(result).getByText("Send it to any biker nearby instead.")).toBeTruthy();
    fireEvent.click(within(result).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(cancelBooking).toHaveBeenCalledWith("fb1");
  });

  it("a biker accepts: the booking's own screen opens", async () => {
    withFleet();
    vi.mocked(createFleetBooking).mockResolvedValue({ booking: fleetBooking("ringing"), deliveryCode: "482910" });
    vi.mocked(getBooking).mockResolvedValue(merchantBooking({ id: "fb1", state: "coming" } as never));
    await openForm({ businessType: "restaurant" });
    await screen.findByRole("radio", { name: /My bikers/ });
    await fillWhere();
    addTyped("Quarter chicken", "6");
    fireEvent.click(screen.getByRole("button", { name: /Ring my bikers/ }));
    await screen.findByRole("dialog", { name: /ringing/ });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/booking?id=fb1"), { timeout: 4000 });
  });

  it("can't reach LyniaGo on Ring: the strip with Try again, and nothing else changes", async () => {
    withFleet();
    vi.mocked(createFleetBooking).mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    await openForm({ businessType: "restaurant" });
    await screen.findByRole("radio", { name: /My bikers/ });
    await fillWhere();
    addTyped("Quarter chicken", "6");
    fireEvent.click(screen.getByRole("button", { name: /Ring my bikers/ }));
    expect(await screen.findByText("Can't reach LyniaGo")).toBeTruthy();
    vi.mocked(createFleetBooking).mockResolvedValueOnce({ booking: fleetBooking("ringing"), deliveryCode: "482910" });
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("dialog", { name: /ringing/ })).toBeTruthy();
  });
});
