// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import ShopPage from "./page";
import { ApiError } from "../../lib/api-client";
import { refreshBranches } from "../../lib/branches";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile, updateProfile } from "../../lib/menu-api";

vi.mock("../../lib/menu-api", () => ({
  getMerchantProfile: vi.fn(),
  updateProfile: vi.fn(),
  mintBannerPhotoUpload: vi.fn(),
  mintDishPhotoUpload: vi.fn(),
  uploadPhotoBlob: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));

vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn() }));
vi.mock("../../lib/branches", () => ({ refreshBranches: vi.fn(() => Promise.resolve([])) }));
// The picker is tested on its own: here each one reports an upload starting and landing.
vi.mock("../../components/menu/PhotoPicker", () => ({
  PhotoPicker: ({ kind, onBusy, onUploaded }: { kind: string; onBusy?: (b: boolean) => void; onUploaded: (key: string, preview: string) => void }) => (
    <>
      <button type="button" onClick={() => onBusy?.(true)}>
        start {kind}
      </button>
      <button
        type="button"
        onClick={() => {
          onUploaded(`banner/p1/${kind}.jpg`, `blob:${kind}`);
          onBusy?.(false);
        }}
      >
        {kind} landed
      </button>
    </>
  ),
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
});

describe("MJ-RM14: the shop front's Save, Saved and preview", () => {
  it("holds Save while a cover is uploading, previews the new cover, and sends it on Save", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ coverPhotoUrl: "https://img/old.jpg" }));
    vi.mocked(updateProfile).mockResolvedValue(profile({ coverPhotoUrl: "https://img/new.jpg" }));
    render(<ShopPage />);
    await screen.findByText("Shop profile");
    const save = () => screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("button", { name: "start banner" }));
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "banner landed" }));
    expect(save().disabled).toBe(false);
    // "What customers see" shows the cover that's about to be saved, not the old one.
    expect(document.querySelector('img[src="blob:banner"]')).toBeTruthy();
    expect(document.querySelector('img[src="https://img/old.jpg"]')).toBeNull();
    fireEvent.click(save());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ coverPhotoUrl: "banner/p1/banner.jpg" })));
  });

  it("takes 'Saved' down once anything changes after a save", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText("Shop profile");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "logo landed" }));
    expect(screen.queryByText("Saved")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Test Kitchen"), { target: { value: "Test Kitchen 2" } });
    expect(screen.queryByText("Saved")).toBeNull();
  });
});

describe("MJ-RL19: a rename reaches the rest of the app", () => {
  it("re-primes the shared business and refreshes the branch list after a rename", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    const renamed = profile({ name: "Mama's Kitchen" });
    vi.mocked(updateProfile).mockResolvedValue(renamed);
    render(<ShopPage />);
    await screen.findByText("Shop profile");
    fireEvent.change(screen.getByDisplayValue("Test Kitchen"), { target: { value: "Mama's Kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(primeBusiness).toHaveBeenCalledWith(renamed));
    expect(refreshBranches).toHaveBeenCalledTimes(1);
  });

  it("re-primes without re-reading the branches when the name didn't change", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockResolvedValue(profile({ description: "New line" }));
    render(<ShopPage />);
    await screen.findByText("Shop profile");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(primeBusiness).toHaveBeenCalled());
    expect(refreshBranches).not.toHaveBeenCalled();
  });
});

describe("ShopPage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(getMerchantProfile)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(profile());

    render(<ShopPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("Shop profile");
    expect(getMerchantProfile).toHaveBeenCalledTimes(2);
  });
});

describe("A shop's profile (merchant web upgrade L2, D-44)", () => {
  it("asks what it sells, says changes go live straight away, and has no cash-order rule to choose", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }));

    render(<ShopPage />);

    expect(await screen.findByText("WHAT YOU SELL · up to 3")).toBeTruthy();
    expect(screen.getByText("This is your shop front. Changes go live straight away.")).toBeTruthy();
    expect(screen.queryByText("How riders pay you")).toBeNull();
    expect(screen.queryAllByText(/food|cook/i)).toHaveLength(0);
  });

  it("a restaurant keeps the profile, with no cash rule (every cash order is collect-and-return, D-48)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant" }));

    render(<ShopPage />);

    expect(await screen.findByText("WHAT YOU COOK · up to 3")).toBeTruthy();
    expect(screen.getByText("This is your shop front. Changes go live straight away.")).toBeTruthy();
    expect(screen.queryByText("How riders pay you")).toBeNull();
  });

  it("is a pushed screen off Account; riders and team live on Account now", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant", myRole: "owner" }));
    render(<ShopPage />);
    expect((await screen.findByRole("link", { name: "Back" })).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("link", { name: "Manage team" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage riders" })).toBeNull();
  });

  it("Staff who reach Shop get one line, not the owner's editor (L4)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "restaurant", myRole: "staff" }));
    render(<ShopPage />);
    expect(await screen.findByText("Only the owner changes the shop front.")).toBeTruthy();
    expect(screen.queryByText("Shop profile")).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage team" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage riders" })).toBeNull();
  });
});
