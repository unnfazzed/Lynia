// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import ShopPage from "./page";
import { ApiError } from "../../lib/api-client";
import { refreshBranches } from "../../lib/branches";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile, updateProfile } from "../../lib/menu-api";
import { SF } from "../../lib/shop-front-copy";

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

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const toast = vi.fn();
vi.mock("../../components/m/Toast", () => ({ useToast: () => toast }));

vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn() }));
vi.mock("../../lib/branches", () => ({ refreshBranches: vi.fn(() => Promise.resolve([])) }));

// The photo flow is its own hook: here each slot can report an upload starting and landing.
const photo = vi.hoisted(() => ({ busy: { banner: false, logo: false }, landed: {} as Record<string, (key: string, preview: string) => void> }));
vi.mock("../../components/shop/useShopPhoto", () => ({
  useShopPhoto: (kind: "banner" | "logo", onUploaded: (key: string, preview: string) => void) => {
    photo.landed[kind] = onUploaded;
    return {
      state: photo.busy[kind] ? { kind: "uploading", preview: { url: `blob:${kind}` }, progress: 40 } : { kind: "idle" },
      busy: photo.busy[kind],
      choose: vi.fn(),
      cancelCrop: vi.fn(),
      confirmCrop: vi.fn(),
      retry: vi.fn(),
      dismiss: vi.fn(),
    };
  },
}));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  photo.busy = { banner: false, logo: false };
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
    businessType: "restaurant",
    shopKind: null,
    pilotEnabled: true,
    myRole: "owner",
    ...over,
  } as MerchantProfileResponse;
}

/** An error carrying the API's own message (api-client marks those; its fallbacks aren't shown). */
function fromServer(status: number, message: string) {
  const err = new ApiError(status, message);
  err.fromServer = true;
  return err;
}

const save = () => screen.getByRole("button", { name: SF.save }) as HTMLButtonElement;
const nameField = () => screen.getByLabelText(SF.nameLabel) as HTMLInputElement;

describe("Shop front v1: Save (D-115)", () => {
  it("is grey until something changes, and undoing the edit by hand makes it grey again", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    expect(save().disabled).toBe(true);
    fireEvent.change(nameField(), { target: { value: "Test Kitchen 2" } });
    expect(save().disabled).toBe(false);
    fireEvent.change(nameField(), { target: { value: "Test Kitchen" } });
    expect(save().disabled).toBe(true);
  });

  it("an empty name turns the field red, says so, and holds Save", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(nameField(), { target: { value: "" } });
    expect(screen.getByText(SF.nameErr)).toBeTruthy();
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(save().disabled).toBe(true);
    // The preview falls back to "Your shop".
    expect(screen.getByText(SF.nameFallback)).toBeTruthy();
  });

  it("MJ-RM14: holds Save while a photo is uploading, then sends the new key", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ coverPhotoUrl: "https://img/old.jpg" }));
    vi.mocked(updateProfile).mockResolvedValue(profile({ coverPhotoUrl: "https://img/new.jpg" }));
    photo.busy.banner = true;
    const { rerender } = render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    expect(screen.getByText(SF.uploading)).toBeTruthy();
    expect(screen.getByText(SF.waitSave)).toBeTruthy();
    fireEvent.change(nameField(), { target: { value: "Test Kitchen 2" } });
    expect(save().disabled).toBe(true);
    photo.busy.banner = false;
    rerender(<ShopPage />);
    await waitFor(() => photo.landed.banner!("banner/p1/new.jpg", "blob:new"));
    await waitFor(() => expect(save().disabled).toBe(false));
    expect(document.querySelector('img[src="blob:new"]')).toBeTruthy();
    fireEvent.click(save());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ coverPhotoUrl: "banner/p1/new.jpg" })));
  });

  it("shows the Saved toast and goes grey; a shop that isn't live gets plain 'Saved'", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockResolvedValue(profile({ description: "New line" }));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(screen.getByLabelText(SF.descLabel), { target: { value: "New line" } });
    fireEvent.click(save());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(SF.saved, { tone: "saved" }));
    expect(save().disabled).toBe(true);
    cleanup();

    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ businessType: "shop", shopKind: "auto_parts", pilotEnabled: false }));
    vi.mocked(updateProfile).mockResolvedValue(profile({ businessType: "shop", shopKind: "auto_parts", pilotEnabled: false, priceLevel: 2 }));
    render(<ShopPage />);
    expect(await screen.findByText(SF.introNotLive)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "$$" }));
    fireEvent.click(save());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(SF.savedNotLive, { tone: "saved" }));
  });

  it("a failed save keeps everything typed and shows the API's message in the bar", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockRejectedValue(fromServer(422, "That name is taken."));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(nameField(), { target: { value: "Mama's Kitchen" } });
    fireEvent.click(save());
    expect((await screen.findByRole("alert")).textContent).toBe("That name is taken.");
    expect(nameField().value).toBe("Mama's Kitchen");
    expect(save().disabled).toBe(false);
  });

  it("a failure with no message from the API says the handoff's own line, not the client's fallback", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockRejectedValue(new ApiError(500, "Request failed (HTTP 500)."));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(nameField(), { target: { value: "X" } });
    fireEvent.click(save());
    expect((await screen.findByRole("alert")).textContent).toBe(SF.saveFail);
  });

  it("signs out instead of showing an error when saving hits a dead session (LC-D##)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(nameField(), { target: { value: "X" } });
    fireEvent.click(save());
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });
});

describe("MJ-RL19: a rename reaches the rest of the app", () => {
  it("re-primes the shared business and refreshes the branch list after a rename", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    const renamed = profile({ name: "Mama's Kitchen" });
    vi.mocked(updateProfile).mockResolvedValue(renamed);
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(nameField(), { target: { value: "Mama's Kitchen" } });
    fireEvent.click(save());
    await waitFor(() => expect(primeBusiness).toHaveBeenCalledWith(renamed));
    expect(refreshBranches).toHaveBeenCalledTimes(1);
  });

  it("re-primes without re-reading the branches when the name didn't change", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateProfile).mockResolvedValue(profile({ description: "New line" }));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.change(screen.getByLabelText(SF.descLabel), { target: { value: "New line" } });
    fireEvent.click(save());
    await waitFor(() => expect(primeBusiness).toHaveBeenCalled());
    expect(refreshBranches).not.toHaveBeenCalled();
  });
});

describe("Shop front v1: tags and price level", () => {
  it("adds with the Add pill, ignores a duplicate and outlines the existing chip, and stops at 3", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ cuisineTags: ["Sadza"] }));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    const field = screen.getByPlaceholderText(SF.tagPh) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "grill" } });
    fireEvent.click(screen.getByRole("button", { name: SF.tagAdd }));
    expect(screen.getByRole("button", { name: SF.tagRemoveA11y("grill") })).toBeTruthy();
    expect(field.value).toBe("");
    fireEvent.change(field, { target: { value: " SADZA " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText(SF.tagDup("Sadza"))).toBeTruthy();
    expect(screen.getByRole("button", { name: SF.tagRemoveA11y("Sadza") }).parentElement!.hasAttribute("data-flash")).toBe(true);
    // A comma adds too (Gboard sends no usable key).
    fireEvent.change(field, { target: { value: "Stews," } });
    expect(screen.getByText(SF.tagFull)).toBeTruthy();
    expect(screen.queryByPlaceholderText(SF.tagPh)).toBeNull();
    expect(screen.getByText(SF.tagsCount(3))).toBeTruthy();
    // Removing one brings the field back.
    fireEvent.click(screen.getByRole("button", { name: SF.tagRemoveA11y("Stews") }));
    expect(screen.getByPlaceholderText(SF.tagPh)).toBeTruthy();
  });

  it("a suggestion adds in one tap; tapping the chosen price again clears it and saves null", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ priceLevel: 2 }));
    vi.mocked(updateProfile).mockResolvedValue(profile({ priceLevel: null }));
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.click(screen.getByRole("button", { name: "Grill" }));
    expect(screen.getByRole("button", { name: SF.tagRemoveA11y("Grill") })).toBeTruthy();
    const two = screen.getByRole("button", { name: "$$" });
    expect(two.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(two);
    expect(two.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(save());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ priceLevel: null, cuisineTags: ["Grill"] })));
  });
});

describe("Shop front v1: photos", () => {
  it("Remove clears a saved banner until Save, with Undo, and sends null", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ coverPhotoUrl: "https://img/old.jpg" }));
    vi.mocked(updateProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.click(screen.getByRole("button", { name: SF.changeBannerA11y }));
    expect(screen.getByText(SF.photoTitle.banner)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SF.remove.banner }));
    expect(screen.getByText(SF.removed.banner)).toBeTruthy();
    expect(screen.getByText(SF.addBanner)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SF.undo }));
    expect(screen.queryByText(SF.removed.banner)).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: SF.changeBannerA11y }));
    fireEvent.click(screen.getByRole("button", { name: SF.remove.banner }));
    fireEvent.click(save());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ coverPhotoUrl: null })));
  });

  it("an empty slot offers no Remove, and draws real empty slots with the tip", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    expect(screen.getByText(SF.addBanner)).toBeTruthy();
    expect(screen.getByText(SF.logoSlot)).toBeTruthy();
    expect(screen.getByText(SF.tip.food)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SF.changeLogoA11y }));
    expect(screen.getByText(SF.logoSub)).toBeTruthy();
    expect(screen.queryByRole("button", { name: SF.remove.logo })).toBeNull();
  });
});

describe("Shop front v1: leaving, loading, staff", () => {
  it("asks before leaving with unsaved changes; Keep editing stays, Leave goes to Account", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    render(<ShopPage />);
    await screen.findByText(SF.previewLabel);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(replace).toHaveBeenCalledWith("/account");
    replace.mockClear();
    fireEvent.change(nameField(), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(SF.leaveT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SF.leaveKeep }));
    expect(screen.queryByText(SF.leaveT)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: SF.leaveGo }));
    expect(replace).toHaveBeenCalledWith("/account");
  });

  it("a failed load shows T14b and Try again recovers", async () => {
    vi.mocked(getMerchantProfile).mockRejectedValueOnce(new ApiError(0, "")).mockResolvedValueOnce(profile());
    render(<ShopPage />);
    expect(await screen.findByText(SF.loadFailT)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SF.retry }));
    await screen.findByText(SF.previewLabel);
    expect(getMerchantProfile).toHaveBeenCalledTimes(2);
  });

  it("staff see the shop front read-only with the lock strip, and no Save", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ myRole: "staff", cuisineTags: ["Grill"] }));
    render(<ShopPage />);
    expect(await screen.findByText(SF.staff)).toBeTruthy();
    expect(screen.getByText("Grill")).toBeTruthy();
    expect(screen.queryByRole("button", { name: SF.save })).toBeNull();
    expect(screen.queryByRole("button", { name: SF.changeBannerA11y })).toBeNull();
    expect((screen.getByRole("link", { name: "Back" }) as HTMLAnchorElement).getAttribute("href")).toBe("/account");
  });

  it("a shop speaks its own words and has no cash rule", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }));
    render(<ShopPage />);
    expect(await screen.findByText(SF.tagsLabel.shop)).toBeTruthy();
    expect(screen.getByText(SF.intro)).toBeTruthy();
    expect(screen.queryByText("How bikers pay you")).toBeNull();
    expect(screen.getByRole("button", { name: "Brakes" })).toBeTruthy();
  });
});
