// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewBookingPage from "./page";
import { ApiError } from "../../../lib/api-client";
import { VALUE_CAP_MESSAGE } from "../../../lib/booking";
import { createBooking, resolveMapLink } from "../../../lib/bookings-api";
import { clearBusinessCache } from "../../../lib/business";
import { getMerchantProfile } from "../../../lib/menu-api";
import { merchantBooking, merchantProfile } from "../../../testing/fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace: nav.replace, push: vi.fn() };
  return { useRouter: () => router };
});

vi.mock("../../../lib/menu-api", () => ({ getMerchantProfile: vi.fn() }));
vi.mock("../../../lib/bookings-api", () => ({ createBooking: vi.fn(), resolveMapLink: vi.fn() }));

vi.mock("../../../components/KitchenConnectionProvider", () => {
  const value = { signOut: vi.fn(), actionsDisabled: false };
  return { useKitchenConnection: () => value };
});

vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div data-testid="kitchen-shell">{children}</div>,
}));

const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Opposite Mbare market", contactPhone: "+263771234567" };

afterEach(() => {
  cleanup();
  clearBusinessCache();
  vi.clearAllMocks();
});

async function openForm(overrides: Parameters<typeof merchantProfile>[0] = {}) {
  vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ businessType: "shop", shopKind: "auto_parts", location: PIN, ...overrides }));
  render(<NewBookingPage />);
  await screen.findByRole("button", { name: "Find a rider" });
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillTheRest() {
  type("What should the rider look for?", "Blue gate opposite the church");
  type("Buyer's phone", "0771234567");
  type("What's going?", "2 brake pads");
  type("What is it worth? (US$)", "45");
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("Book a rider form (merchant web upgrade L2)", () => {
  it("collects everything before the 90 seconds start: an empty form books nothing and says what's missing", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Find a rider" }));

    expect(await screen.findByText("Paste the location the buyer sent, or drag the map until the pin is on their door.")).toBeTruthy();
    expect(screen.getByText("Tell the rider what to look for.")).toBeTruthy();
    expect(screen.getByText("Enter the buyer's phone, like 0771234567.")).toBeTruthy();
    expect(screen.getByText("Tick the box to accept how LyniaGo works.")).toBeTruthy();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("reads a pasted location, suggests Send's fare, and books once with the details it collected", async () => {
    vi.mocked(createBooking).mockResolvedValue(merchantBooking({ id: "33333333-3333-4333-8333-333333333333" }));
    await openForm();

    type("Where is it going?", "-17.8, 31.05");
    expect(await screen.findByText("Got it. Check the pin below.")).toBeTruthy();
    expect((screen.getByLabelText("Fare you offer (US$)") as HTMLInputElement).value).toMatch(/^\d+\.\d{2}$/);
    expect(screen.getByText(/^Suggested fare \$\d+\.\d{2}\. Riders may offer a different fare; you pay the rider you pick, in cash at pickup\.$/)).toBeTruthy();

    fillTheRest();
    fireEvent.click(screen.getByRole("button", { name: "Find a rider" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries/33333333-3333-4333-8333-333333333333"));
    expect(createBooking).toHaveBeenCalledTimes(1);
    const body = vi.mocked(createBooking).mock.calls[0]![0];
    expect(body.dropoff).toEqual({ point: { lat: -17.8, lng: 31.05 }, landmark: "Blue gate opposite the church", contactPhone: "+263771234567" });
    expect(body.items).toEqual([{ description: "2 brake pads", quantity: 1 }]);
    expect(body.declaredValue).toBe(45);
  });

  it("keeps a fare the booker typed, even when the pin moves", async () => {
    await openForm();
    type("Where is it going?", "-17.8, 31.05");
    type("Fare you offer (US$)", "5.00");
    type("Where is it going?", "-17.79, 31.04");
    await screen.findByText("Got it. Check the pin below.");
    expect((screen.getByLabelText("Fare you offer (US$)") as HTMLInputElement).value).toBe("5.00");
  });

  it("blocks goods over $150 with the cap message", async () => {
    await openForm();
    type("Where is it going?", "-17.8, 31.05");
    fillTheRest();
    type("What is it worth? (US$)", "200");
    fireEvent.click(screen.getByRole("button", { name: "Find a rider" }));
    expect(await screen.findByText(VALUE_CAP_MESSAGE)).toBeTruthy();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("asks the API to follow a Google Maps short link, and says so plainly when it can't", async () => {
    vi.mocked(resolveMapLink).mockResolvedValueOnce({ lat: -17.81, lng: 31.06 });
    await openForm();

    type("Where is it going?", "Here: https://maps.app.goo.gl/AbC123");
    expect(screen.getByText("Reading the link…")).toBeTruthy();
    expect(await screen.findByText("Got it. Check the pin below.")).toBeTruthy();
    expect(resolveMapLink).toHaveBeenCalledWith("https://maps.app.goo.gl/AbC123");

    vi.mocked(resolveMapLink).mockRejectedValueOnce(new ApiError(422, "We couldn't read a location from that link. Drop a pin instead.", "unreadable_link"));
    type("Where is it going?", "https://maps.app.goo.gl/Nope");
    expect(await screen.findByText("We couldn't read a location from that link. Drop a pin instead.")).toBeTruthy();
  });

  it("never lets an older link's late answer move the pin", async () => {
    let answerOld: (p: { lat: number; lng: number }) => void = () => {};
    vi.mocked(resolveMapLink).mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
    await openForm();

    type("Where is it going?", "https://maps.app.goo.gl/Old");
    await waitFor(() => expect(resolveMapLink).toHaveBeenCalledTimes(1));
    type("Where is it going?", "-17.8, 31.05");
    answerOld({ lat: -17.7, lng: 30.9 });

    fillTheRest();
    vi.mocked(createBooking).mockResolvedValue(merchantBooking());
    fireEvent.click(screen.getByRole("button", { name: "Find a rider" }));
    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(vi.mocked(createBooking).mock.calls[0]![0].dropoff.point).toEqual({ lat: -17.8, lng: 31.05 });
  });

  it("shows the API's refusal, like a business on hold, without leaving the form", async () => {
    vi.mocked(createBooking).mockRejectedValue(new ApiError(403, "Bookings for this business are on hold. Message LyniaGo.", "business_on_hold"));
    await openForm();
    type("Where is it going?", "-17.8, 31.05");
    fillTheRest();
    fireEvent.click(screen.getByRole("button", { name: "Find a rider" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Bookings for this business are on hold. Message LyniaGo.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("tells a pharmacy it's over-the-counter items only, and everyone about prohibited goods and no cash-on-delivery", async () => {
    await openForm({ shopKind: "pharmacy" });
    expect(screen.getByText("No prescription medicine, weapons, drugs or cash. Over-the-counter items only.")).toBeTruthy();
    expect(screen.getByText("No cash-on-delivery: the rider collects nothing from the buyer. The buyer pays you as they do today.")).toBeTruthy();
  });

  it("has no form for a business without a pin, and sends everyone back when the API can't book yet", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ location: null }));
    render(<NewBookingPage />);
    expect(await screen.findByText("Your business has no pin yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Find a rider" })).toBeNull();

    cleanup();
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile());
    render(<NewBookingPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries"));
  });
});
