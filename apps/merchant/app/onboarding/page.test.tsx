// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";
import { ApiError, becomeMerchant, getMyAccount, getMyMerchant } from "../lib/api-client";
import { resolvePlace, reverseGeocode, searchPlaces } from "../lib/places";
import { merchantProfile } from "../testing/fixtures";
import { noBusinessPath } from "../lib/team-api";

// One stable router, as Next's own is: the page's account check depends on it.
const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push };
  return { useRouter: () => router };
});

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn(), getMyAccount: vi.fn(), becomeMerchant: vi.fn() };
});

vi.mock("../lib/places", () => ({
  placesEnabled: () => true,
  newSessionToken: () => "session",
  searchPlaces: vi.fn(async () => []),
  resolvePlace: vi.fn(),
  reverseGeocode: vi.fn(),
}));

// L4: whether a team invited the number (Join) or not; the sign-up unless a test says otherwise.
vi.mock("../lib/team-api", () => ({ noBusinessPath: vi.fn(async () => "/onboarding") }));

const notAMember = () => new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member");
const MBARE = { lat: -17.861, lng: 31.036 };

function mockGps(point: { lat: number; lng: number } | null) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        point
          ? ok({ coords: { latitude: point.lat, longitude: point.lng, accuracy: 20 } } as GeolocationPosition)
          : fail({ code: 1 } as GeolocationPositionError),
    },
  });
}

beforeEach(() => {
  vi.mocked(getMyMerchant).mockRejectedValue(notAMember());
  vi.mocked(getMyAccount).mockResolvedValue({ firstName: "Tendai", lastName: "Moyo", phone: "+263771234567" });
  vi.mocked(reverseGeocode).mockResolvedValue({ point: MBARE, address: "5th Street, Mbare" });
  mockGps(MBARE);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function toDetailsAs(type: "Restaurant" | "Shop" | "Pharmacy") {
  render(<OnboardingPage />);
  await screen.findByText("What do you sell?");
  fireEvent.click(screen.getByRole("radio", { name: type }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Your business");
}

describe("A3 · What do you sell? (merchant mobile redesign, D-48)", () => {
  it("sends someone already on a business to its home instead of signing up again", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile());
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));

    cleanup();
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "grocery" }));
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
  });

  it("is restaurant, shop or pharmacy (D-76) — no other shop kinds — and Next waits for the pick", async () => {
    render(<OnboardingPage />);
    await screen.findByText("Step 1 of 2");
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Restaurant", "Shop", "Pharmacy"]);
    fireEvent.click(screen.getByRole("radio", { name: "Shop" }));
    expect(screen.getByRole("radio", { name: "Shop" }).getAttribute("aria-checked")).toBe("true");
    expect(next.disabled).toBe(false);
  });

  it("links to Join for someone joining a team", async () => {
    render(<OnboardingPage />);
    expect((await screen.findByRole("link", { name: "Joining a team instead?" })).getAttribute("href")).toBe("/join");
  });

  it("shows Join instead when a team has invited this number", async () => {
    vi.mocked(noBusinessPath).mockResolvedValueOnce("/join");
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/join"));
  });
});

describe("A4 · Your business", () => {
  it("is prefilled with your name from your LyniaGo account", async () => {
    await toDetailsAs("Restaurant");
    await vi.waitFor(() => expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Tendai Moyo"));
    expect(screen.queryByText(/landmark/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("finds the business with the phone's location, names it, and creates it with the signed-in number", async () => {
    vi.mocked(becomeMerchant).mockResolvedValue(merchantProfile({ businessType: "shop" }));
    await toDetailsAs("Shop");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Mbare Auto Spares" } });
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText("5th Street, Mbare")).toBeTruthy();
    expect(screen.getByText("From your phone’s location")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
    expect(becomeMerchant).toHaveBeenCalledWith({
      ownerName: "Tendai Moyo",
      name: "Mbare Auto Spares",
      businessType: "shop",
      location: { point: MBARE, address: "5th Street, Mbare", contactPhone: "+263771234567" },
      termsAccepted: true,
    });
  });

  it("signs a pharmacy up as a shop of kind pharmacy, so it lists under Pharmacy", async () => {
    vi.mocked(becomeMerchant).mockResolvedValue(merchantProfile({ businessType: "shop", shopKind: "pharmacy" }));
    await toDetailsAs("Pharmacy");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Mbare Pharmacy" } });
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText("5th Street, Mbare")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
    expect(becomeMerchant).toHaveBeenCalledWith(expect.objectContaining({ name: "Mbare Pharmacy", businessType: "shop", shopKind: "pharmacy" }));
  });

  it("finds the business by searching, and Change goes to the search", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([{ placeId: "p1", primary: "Fife Avenue", secondary: "Harare" }]);
    vi.mocked(resolvePlace).mockResolvedValue({ point: { lat: -17.82, lng: 31.05 }, address: "Fife Avenue, Avenues" });
    await toDetailsAs("Restaurant");
    fireEvent.change(screen.getByLabelText("Search street or area"), { target: { value: "Fife" } });
    fireEvent.click(await screen.findByRole("button", { name: /Fife Avenue/ }, { timeout: 2000 }));
    expect(await screen.findByText("Fife Avenue, Avenues")).toBeTruthy();
    expect(screen.getByText("From your search")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use my current location" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Search street or area"));
  });

  it("says 'Your current location' when nothing could name the fix, and asks for a location before creating", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(null);
    await toDetailsAs("Restaurant");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sadza Republic" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect(await screen.findByText("Use your current location, or search for your street.")).toBeTruthy();
    expect(becomeMerchant).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText("Your current location")).toBeTruthy();
  });

  it("points to search when the phone won't share its location", async () => {
    mockGps(null);
    await toDetailsAs("Restaurant");
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText("Couldn't get your location. Search for your street instead.")).toBeTruthy();
  });

  it("a lost answer retried (409 already_member) carries on home", async () => {
    vi.mocked(becomeMerchant).mockRejectedValue(new ApiError(409, "Already on a business", "already_member"));
    await toDetailsAs("Restaurant");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sadza Republic" } });
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    await screen.findByText("5th Street, Mbare");
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });

  it("shows the API's out-of-area refusal on the location, and a held account's reason as a banner", async () => {
    vi.mocked(becomeMerchant).mockRejectedValueOnce(new ApiError(400, "That pin is outside the area LyniaGo covers for now.", "outside_service_area"));
    await toDetailsAs("Restaurant");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sadza Republic" } });
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    await screen.findByText("5th Street, Mbare");
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect(await screen.findByText("That pin is outside the area LyniaGo covers for now.")).toBeTruthy();

    vi.mocked(becomeMerchant).mockRejectedValueOnce(new ApiError(403, "This account is on hold.", "on_hold"));
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This account is on hold.");
  });

  it("Back returns to step 1 and keeps what was typed", async () => {
    await toDetailsAs("Shop");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Mbare Auto Spares" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: "Shop" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Mbare Auto Spares");
  });
});
