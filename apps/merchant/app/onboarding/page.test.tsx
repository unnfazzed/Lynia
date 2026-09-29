// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";
import { ApiError, becomeMerchant, getMyAccount, getMyMerchant } from "../lib/api-client";
import { merchantProfile } from "../testing/fixtures";

// One stable router, as Next's own is: the page's account check depends on it.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router };
});

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn(), getMyAccount: vi.fn(), becomeMerchant: vi.fn() };
});

const notAMember = () => new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member");

beforeEach(() => {
  vi.mocked(getMyMerchant).mockRejectedValue(notAMember());
  vi.mocked(getMyAccount).mockResolvedValue({ firstName: "Tendai", lastName: "Moyo", phone: "+263771234567" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function toDetailsAs(type: "Restaurant" | "Shop", kind?: string) {
  render(<OnboardingPage />);
  await screen.findByText("What do you sell?");
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${type}`) }));
  if (kind) fireEvent.click(screen.getByRole("radio", { name: kind }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Your business");
}

function fillDetails() {
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Mbare Auto Spares" } });
  fireEvent.change(screen.getByLabelText("A landmark riders look for"), { target: { value: "Next to the Total garage" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

/** The keyboard path through the map: one arrow press places the pin (as a drag would). */
function placePin() {
  fireEvent.keyDown(screen.getByRole("button", { name: /Your business on the map/ }), { key: "ArrowLeft" });
}

describe("Set up your business (merchant web upgrade L1)", () => {
  it("sends someone already on a business to its home instead of signing up again", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile());
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));

    cleanup();
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "grocery" }));
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
  });

  it("step 1: Next waits for the type, and a shop also needs its kind", async () => {
    render(<OnboardingPage />);
    await screen.findByText("What do you sell?");
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("radio", { name: /^Shop/ }));
    expect(next).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: "Pharmacy" }));
    expect(next).toHaveProperty("disabled", false);
    expect(screen.getByText("Over-the-counter products only for now.")).toBeTruthy();
    expect(screen.getByText(/can't switch between restaurant and shop later/)).toBeTruthy();
  });

  it("step 2 is prefilled from the person's own LyniaGo account", async () => {
    await toDetailsAs("Shop", "Car parts");
    expect(screen.getByText("Car parts · Shop")).toBeTruthy();
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>("Your name").value).toBe("Tendai Moyo"));
    expect(screen.getByLabelText<HTMLInputElement>("Contact phone").value).toBe("0771234567");
  });

  it("won't take the untouched starting pin as the address", async () => {
    await toDetailsAs("Restaurant");
    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect(await screen.findByText("Drag the map until the pin sits on your door, or tap “Use my location”.")).toBeTruthy();
    expect(becomeMerchant).not.toHaveBeenCalled();
  });

  it("creates the business and its owner membership, then lands on /setup", async () => {
    vi.mocked(becomeMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    await toDetailsAs("Shop", "Car parts");
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>("Your name").value).toBe("Tendai Moyo"));
    fillDetails();
    placePin();
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
    const body = vi.mocked(becomeMerchant).mock.calls[0]![0];
    expect(body).toMatchObject({
      ownerName: "Tendai Moyo",
      name: "Mbare Auto Spares",
      businessType: "shop",
      shopKind: "auto_parts",
      location: { landmark: "Next to the Total garage", contactPhone: "0771234567" },
      termsAccepted: true,
    });
    expect(body.location.point.lng).toBeLessThan(31.0522);
  });

  it("a lost answer retried (409 already_member) carries on to /setup", async () => {
    vi.mocked(becomeMerchant).mockRejectedValueOnce(new ApiError(409, "You're already on a business on LyniaGo.", "already_member"));
    await toDetailsAs("Restaurant");
    fillDetails();
    placePin();
    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
  });

  it("shows the API's outside-the-area refusal on the map, and a held account's reason as a banner", async () => {
    vi.mocked(becomeMerchant)
      .mockRejectedValueOnce(new ApiError(400, "That pin is outside the area LyniaGo covers for now.", "outside_service_area"))
      .mockRejectedValueOnce(new ApiError(403, "This account is on hold. Message LyniaGo on WhatsApp.", "on_hold"));
    await toDetailsAs("Restaurant");
    fillDetails();
    placePin();

    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect(await screen.findByText("That pin is outside the area LyniaGo covers for now.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create my business" }));
    expect(await screen.findByText("This account is on hold. Message LyniaGo on WhatsApp.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("Back keeps what was typed", async () => {
    await toDetailsAs("Restaurant");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Mai Tino's Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getByLabelText<HTMLInputElement>("Business name").value).toBe("Mai Tino's Kitchen");
  });
});
