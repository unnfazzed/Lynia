// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import ShopPage from "./page";
import { ApiError } from "../../lib/api-client";
import { getMerchantProfile, updateCashRule, updateProfile } from "../../lib/menu-api";

vi.mock("../../lib/menu-api", () => ({
  getMerchantProfile: vi.fn(),
  updateProfile: vi.fn(),
  updateCashRule: vi.fn(),
  mintBannerPhotoUpload: vi.fn(),
  mintDishPhotoUpload: vi.fn(),
  uploadPhotoBlob: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function profile(over: Partial<MerchantProfileResponse> = {}): MerchantProfileResponse {
  return {
    id: "m1",
    name: "Test Kitchen",
    description: "",
    cuisineTags: [],
    priceLevel: 1,
    coverPhotoUrl: null,
    logoUrl: null,
    cashRule: "collect_and_return",
    hours: {},
    busy: false,
    ...over,
  } as MerchantProfileResponse;
}

// LC-D##: before this fix, ShopPage's mutation catches (onSave/onChooseCashRule) only showed an
// inline error — unlike its own initial-load effect, which already checked for a dead-session 401
// and called signOut(). A mutation hitting a dead session stranded the merchant here with no way
// back to /login.
describe("ShopPage session-expiry on a mutation (LC-D##)", () => {
  it("signs out instead of showing an inline error when saving the shop profile hits a dead session", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));

    render(<ShopPage />);
    await screen.findByText("Shop profile");
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });

  it("signs out instead of showing an inline error when choosing a cash rule hits a dead session", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ cashRule: "collect_and_return" }));
    vi.mocked(updateCashRule).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));

    render(<ShopPage />);
    await screen.findByText("Shop profile");
    fireEvent.click(screen.getByText("Pay me upfront"));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });
});

describe("ShopPage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(getMerchantProfile)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(profile());

    render(<ShopPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Shop profile");
    expect(getMerchantProfile).toHaveBeenCalledTimes(2);
  });
});

describe("A shop's profile (merchant web upgrade L2, D-44)", () => {
  it("asks what it sells, says when customers will see it, and has no cash-order rule to choose", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }));

    render(<ShopPage />);

    expect(await screen.findByText("WHAT YOU SELL · up to 3")).toBeTruthy();
    expect(screen.getByText("This is your shop front. Customers will see it when LyniaGo Shops opens.")).toBeTruthy();
    expect(screen.queryByText("How riders pay you")).toBeNull();
    expect(screen.queryAllByText(/food|cook/i)).toHaveLength(0);
  });

  it("a restaurant keeps the drawn profile, cash rule included", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant" }));

    render(<ShopPage />);

    expect(await screen.findByText("WHAT YOU COOK · up to 3")).toBeTruthy();
    expect(screen.getByText("This is your shop front. Changes go live straight away.")).toBeTruthy();
    expect(screen.getByText("How riders pay you")).toBeTruthy();
  });

  it("a restaurant reaches its own riders from Shop (L3); a shop has them in its nav instead", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant" }));
    render(<ShopPage />);
    expect((await screen.findByRole("link", { name: "Manage riders" })).getAttribute("href")).toBe("/riders");

    cleanup();
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "shop", shopKind: "auto_parts" }));
    render(<ShopPage />);
    await screen.findByText("WHAT YOU SELL · up to 3");
    expect(screen.queryByRole("link", { name: "Manage riders" })).toBeNull();
  });

  it("the owner reaches the team from Shop, for both types (L4)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "shop", shopKind: "auto_parts", myRole: "owner" }));
    render(<ShopPage />);
    expect((await screen.findByRole("link", { name: "Manage team" })).getAttribute("href")).toBe("/team");

    cleanup();
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant", myRole: "owner" }));
    render(<ShopPage />);
    expect((await screen.findByRole("link", { name: "Manage team" })).getAttribute("href")).toBe("/team");
  });

  it("Staff who reach Shop get one line, not the owner's editor (L4)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant", myRole: "staff" }));
    render(<ShopPage />);
    expect(await screen.findByText("Only the owner changes the shop's details, its riders and its team.")).toBeTruthy();
    expect(screen.queryByText("Shop profile")).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage team" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage riders" })).toBeNull();
  });
});
