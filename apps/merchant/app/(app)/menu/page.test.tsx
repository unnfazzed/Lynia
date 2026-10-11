// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import MenuPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { ApiError } from "../../lib/api-client";
import { clearBusinessCache, primeBusiness } from "../../lib/business";
import { clearDishOutOfStock, createCategory, createDish, deleteCategory, deleteDish, listCategories, listDishes, setDishOutOfStock, updateCategory, updateDish } from "../../lib/menu-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({
  listCategories: vi.fn(),
  listDishes: vi.fn(),
  clearDishOutOfStock: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createDish: vi.fn(),
  updateDish: vi.fn(),
  deleteDish: vi.fn(),
  setDishOutOfStock: vi.fn(),
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
  clearBusinessCache();
});

const Page = () => (
  <ToastProvider>
    <MenuPage />
  </ToastProvider>
);

function category(over: Partial<MerchantCategoryResponse> = {}): MerchantCategoryResponse {
  return {
    id: "c1",
    name: "Mains",
    sortOrder: 0,
    availableFrom: null,
    availableTo: null,
    hidden: false,
    dishCount: 1,
    ...over,
  };
}

function dish(over: Partial<MerchantDishResponse> = {}): MerchantDishResponse {
  return {
    id: "d1",
    categoryId: "c1",
    name: "Sadza",
    description: null,
    priceUsd: 3,
    photoUrl: null,
    isDraft: false,
    outOfStock: true,
    sortOrder: 0,
    ...over,
  };
}

describe("C1 · Menu (merchant mobile, D-48)", () => {
  it("draws the title, search, category chips with counts, and rows with a stock switch", async () => {
    primeBusiness(merchantProfile());
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 2 }), category({ id: "c2", name: "Drinks", sortOrder: 1, dishCount: 1 })]);
    vi.mocked(listDishes).mockResolvedValue([
      dish({ name: "Mazondo", priceUsd: 5, outOfStock: false }),
      dish({ id: "d2", name: "Sadza & road-runner", outOfStock: true, outOfStockUntil: null }),
      dish({ id: "d3", categoryId: "c2", name: "Mazoe", outOfStock: false }),
    ]);
    render(<Page />);
    expect(await screen.findByText("Menu")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search dishes" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Mains 2" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("$5.00")).toBeTruthy();
    expect(screen.getByText("Off until tomorrow")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Mazondo in stock" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Sadza & road-runner in stock" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Mazoe")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Drinks 1" }));
    expect(screen.getByText("Mazoe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a dish" })).toBeTruthy();
  });

  it("search finds a dish in any category", async () => {
    vi.mocked(listCategories).mockResolvedValue([category(), category({ id: "c2", name: "Drinks", sortOrder: 1 })]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false }), dish({ id: "d3", categoryId: "c2", name: "Mazoe", outOfStock: false })]);
    render(<Page />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search dishes" }), { target: { value: "maz" } });
    expect(screen.getByText("Mazoe")).toBeTruthy();
    expect(screen.queryByText("Sadza")).toBeNull();
  });

  it("a long press on a chip opens its sheet, which moves it along the row", async () => {
    vi.mocked(listCategories).mockResolvedValue([category(), category({ id: "c2", name: "Drinks", sortOrder: 1 })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(updateCategory).mockResolvedValue(category());
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Drinks 1" }));
    expect((screen.getByRole("button", { name: "Move later →" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "← Move earlier" }));
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("c2", { sortOrder: 0 }));
    expect(updateCategory).toHaveBeenCalledWith("c1", { sortOrder: 1 });
  });
});

describe("turning a dish back on (LC-D04)", () => {
  // A dropped connection mid-tap must not silently leave the dish off.
  it("shows a retryable error when clearDishOutOfStock fails", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    expect(await screen.findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
  });

  it("is one tap, and says so", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockResolvedValueOnce(dish({ outOfStock: false }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    await waitFor(() => expect(clearDishOutOfStock).toHaveBeenCalledWith("d1"));
    expect(await screen.findByText("Sadza is back on")).toBeTruthy();
    expect(screen.queryByText(/Couldn't reach the server/i)).toBeNull();
  });
});

describe("C2 · Out-of-stock sheet", () => {
  it("defaults to Rest of today, back at tomorrow's opening time", async () => {
    const ALL = { open: "08:00", close: "22:00" };
    primeBusiness(merchantProfile({ hours: { mon: ALL, tue: ALL, wed: ALL, thu: ALL, fri: ALL, sat: ALL, sun: ALL } }));
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(setDishOutOfStock).mockResolvedValue(dish());
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    expect(screen.getByText("Sadza is off. For how long?")).toBeTruthy();
    expect(screen.getByText("Back on automatically at 08:00")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Rest of today/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(setDishOutOfStock).toHaveBeenCalledWith("d1", "rest_of_today"));
    expect(await screen.findByText("Sadza off until 08:00")).toBeTruthy();
  });

  it("sends Until I turn it back on; Keep it on changes nothing", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(setDishOutOfStock).mockResolvedValue(dish());
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Keep it on" }).at(-1)!);
    expect(screen.queryByText("Sadza is off. For how long?")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Sadza in stock" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until I turn it back on" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(setDishOutOfStock).toHaveBeenCalledWith("d1", "until_back"));
  });
});

describe("the empty menu (D-D0e)", () => {
  it("shows a retryable error when a starter category fails", async () => {
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<Page />);
    fireEvent.click(await screen.findByText("+ Mains"));
    expect(await screen.findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
  });
});

describe("a dead session on a change signs out (LC-D##)", () => {
  it("on a starter category", async () => {
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<Page />);
    fireEvent.click(await screen.findByText("+ Mains"));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });

  it("on turning a dish back on", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("on deleting a category from its sheet", async () => {
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 0 })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(deleteCategory).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Mains 0" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Mains?" })).getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });
});

describe("the dish editor (E2E 2026-10-05 P-2, P-3)", () => {
  it("a rejected save says the generic line, not the API's raw validation text", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(updateDish).mockRejectedValue(new ApiError(400, "priceUsd: Too big: expected number to be <=1000", undefined, true));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sadza" }));
    // MJ-H3: a dish with no photo saves as a draft, and the button says so.
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Something went wrong — try again.")).toBeTruthy();
    expect(screen.queryByText(/priceUsd/)).toBeNull();
  });

  it("a new dish isn't 'Saved, but…' before it is saved; a saved draft is", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false, isDraft: true })]);
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sadza" }));
    expect(screen.getByText(/Saved, but customers can.t see it yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a dish" }));
    expect(screen.getByText("DISH PHOTO")).toBeTruthy();
    expect(screen.queryByText(/Saved, but customers can.t see it yet/)).toBeNull();
  });
});

describe("the editors can take a value away (MJ-RM10, MJ-RL12)", () => {
  it("MJ-RM10: turning a category's time window off removes it (null), so its dishes sell all day again", async () => {
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 0, availableFrom: "07:00", availableTo: "11:00" })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(updateCategory).mockResolvedValue(category());
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Mains 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Only available at certain times" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("c1", { name: "Mains", availableFrom: null, availableTo: null, hidden: false }));
  });

  it("MJ-RM10: a category that never had a window sends nothing about one, and a new one never sends null", async () => {
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 0 })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(updateCategory).mockResolvedValue(category());
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Mains 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("c1", { name: "Mains", hidden: false }));
  });

  it("MJ-RL12: clearing a dish's description saves null, which removes it", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false, description: "Soft and white", photoUrl: "https://img/x.jpg" })]);
    vi.mocked(updateDish).mockResolvedValue(dish());
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sadza" }));
    fireEvent.change(screen.getByDisplayValue("Soft and white"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateDish).toHaveBeenCalled());
    expect(vi.mocked(updateDish).mock.calls[0]![1]).toMatchObject({ description: null });
  });

  it("MJ-RL12: a new dish with no description just leaves it out", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createDish).mockResolvedValue(dish());
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a dish" }));
    const sheet = screen.getByText("DISH PHOTO").closest(".kitchen-sheet") as HTMLElement;
    const [nameField, , priceField] = within(sheet).getAllByRole("textbox");
    fireEvent.change(nameField!, { target: { value: "Rice" } });
    fireEvent.change(priceField!, { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(createDish).toHaveBeenCalled());
    expect(vi.mocked(createDish).mock.calls[0]![0].description).toBeUndefined();
  });
});

describe("MJ-H3: the dish editor on a phone", () => {
  it("the photo slot leads the stacked layout, and Save names a draft honestly until a photo is there", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false, photoUrl: "https://img/x.jpg" })]);
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a dish" }));
    expect(screen.getByTestId("dish-photo-slot").className).toContain("kitchen-aside-first");
    expect(screen.getByRole("button", { name: "Save as draft" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // A dish that has its photo keeps "Save changes".
    fireEvent.click(screen.getByRole("button", { name: "Edit Sadza" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });
});

describe("deleting asks first (merchant-mobile README: destructive actions are behind a confirm sheet)", () => {
  it("Delete dish opens the confirm sheet; Keep leaves the dish and its editor as they were", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(deleteDish).mockResolvedValue({ ok: true });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sadza" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    const sheet = screen.getByRole("dialog", { name: "Delete Sadza?" });
    expect(within(sheet).getByText("It comes off your menu. You can’t undo this.")).toBeTruthy();
    expect(deleteDish).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getAllByRole("button", { name: "Keep" }).at(-1)!);
    expect(screen.queryByRole("dialog", { name: "Delete Sadza?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete dish" })).toBeTruthy();
    expect(deleteDish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Sadza?" })).getByRole("button", { name: "Delete dish" }));
    await waitFor(() => expect(deleteDish).toHaveBeenCalledWith("d1"));
    expect(await screen.findByText("Sadza deleted")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Delete Sadza?" })).toBeNull();
  });

  it("Delete on an empty category's sheet asks before deleting it", async () => {
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 0 })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(deleteCategory).mockResolvedValue({ ok: true });
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Mains 0" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(deleteCategory).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Mains?" })).getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Mains deleted")).toBeTruthy();
  });

  it("a failed delete says why on the confirm sheet, and deletes nothing more", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(deleteDish).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Sadza" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
    const sheet = screen.getByRole("dialog", { name: "Delete Sadza?" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete dish" }));
    expect(await within(sheet).findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    expect(deleteDish).toHaveBeenCalledTimes(1);
  });

  it("a shop's sheet speaks of items and the shop", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listCategories).mockResolvedValue([category({ name: "Brakes" })]);
    vi.mocked(listDishes).mockResolvedValue([dish({ name: "Brake pads", outOfStock: false })]);
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Brake pads" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    const sheet = screen.getByRole("dialog", { name: "Delete Brake pads?" });
    expect(within(sheet).getByText("It comes off your shop. You can’t undo this.")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Delete item" })).toBeTruthy();
  });
});

describe("a failed load has a way out (LC-D##)", () => {
  it("Retry recovers", async () => {
    vi.mocked(listCategories)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("tab", { name: "Mains 1" })).toBeTruthy();
    expect(listCategories).toHaveBeenCalledTimes(2);
  });
});

describe("E1 · a shop's Items speak its own words (D-44)", () => {
  it("offers the shop kind's starting categories", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    render(<Page />);
    expect(await screen.findByText("+ Engine")).toBeTruthy();
    expect(screen.queryByText("+ Mains")).toBeNull();
  });

  it("titles the list Inventory (Merchant v2, D-77), searches items and adds an item", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listCategories).mockResolvedValue([category({ name: "Brakes" })]);
    vi.mocked(listDishes).mockResolvedValue([dish({ name: "Brake pads", outOfStock: false })]);
    render(<Page />);
    expect((await screen.findAllByText("Inventory")).length).toBeGreaterThan(0);
    expect(screen.getByRole("searchbox", { name: "Search items" })).toBeTruthy();
    // E1 draws "All" first, chosen to start with.
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryAllByText(/dish|menu/i)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    expect(screen.getByText("ITEM PHOTO")).toBeTruthy();
  });
});

describe("Staff only turn items off and back on (L4)", () => {
  it("get the switches and none of the owner's editing", async () => {
    primeBusiness(merchantProfile({ myRole: "staff" }));
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    render(<Page />);
    expect(await screen.findByRole("switch", { name: "Sadza in stock" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a dish" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Category/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Sadza" })).toBeNull();
  });

  it("an empty list offers Staff no starting categories", async () => {
    primeBusiness(merchantProfile({ myRole: "staff" }));
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    render(<Page />);
    expect(await screen.findByText("No dishes yet")).toBeTruthy();
    expect(screen.queryByText("+ Mains")).toBeNull();
  });
});

// MJ-RL22 (2026-10-07): each stock switch waited for a second round trip that re-read the whole menu, and
// a failed refresh replaced the menu with the error screen.
describe("MJ-RL22: stock switches and background refreshes", () => {
  it("turning a dish back on puts the dish the API returns in the list, with no second read", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockResolvedValueOnce(dish({ outOfStock: false }));
    render(<Page />);
    const sw = await screen.findByRole("switch", { name: "Sadza in stock" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(await screen.findByText("Sadza is back on")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Sadza in stock" }).getAttribute("aria-checked")).toBe("true");
    expect(listDishes).toHaveBeenCalledTimes(1);
    expect(listCategories).toHaveBeenCalledTimes(1);
  });

  it("turning one off does the same", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(setDishOutOfStock).mockResolvedValue(dish({ outOfStock: true, outOfStockUntil: null }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Sadza in stock" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until I turn it back on" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("Sadza is off")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Sadza in stock" }).getAttribute("aria-checked")).toBe("false");
    expect(listDishes).toHaveBeenCalledTimes(1);
  });

  it("a refresh after a save that fails keeps the list on screen and says so in the toast", async () => {
    vi.mocked(listCategories)
      .mockResolvedValueOnce([category(), category({ id: "c2", name: "Drinks", sortOrder: 1 })])
      .mockRejectedValueOnce(new ApiError(503, "Restaurants isn't live on this account yet."));
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(updateCategory).mockResolvedValue(category());
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Drinks 1" }));
    fireEvent.click(screen.getByRole("button", { name: "← Move earlier" }));
    expect(await screen.findByText("Restaurants isn't live on this account yet.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Restaurants isn't live on this account yet.");
    expect(screen.getByRole("tab", { name: "Mains 1" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Sadza in stock" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offline, a failed refresh keeps the list and leaves the telling to the connection bar", async () => {
    vi.mocked(listCategories)
      .mockResolvedValueOnce([category(), category({ id: "c2", name: "Drinks", sortOrder: 1 })])
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(updateCategory).mockResolvedValue(category());
    render(<Page />);
    fireEvent.contextMenu(await screen.findByRole("tab", { name: "Drinks 1" }));
    fireEvent.click(screen.getByRole("button", { name: "← Move earlier" }));
    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(2));
    await screen.findByText("Moved earlier");
    expect(screen.getByRole("tab", { name: "Mains 1" })).toBeTruthy();
    expect(screen.queryByText("Couldn't reach the server — check the connection and try again.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
