// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import MenuPage from "./page";
import { ApiError } from "../../lib/api-client";
import { clearBusinessCache, primeBusiness } from "../../lib/business";
import { clearDishOutOfStock, createCategory, deleteCategory, listCategories, listDishes, setDishOutOfStock } from "../../lib/menu-api";
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
});

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

describe("MenuPage 'back in stock' tap (LC-D04)", () => {
  // Before this fix, `onClearOos` had a bare try/finally with no catch — a dropped connection
  // mid-tap silently left the dish marked out of stock with no indication the tap failed.
  it("shows a retryable error when clearDishOutOfStock fails", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));

    render(<MenuPage />);
    const backInStock = await screen.findByText("Back in stock");
    fireEvent.click(backInStock);

    await waitFor(() => {
      expect(screen.getByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    });
  });

  it("clears any prior list error on a successful retry", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockResolvedValueOnce(dish({ outOfStock: false }));

    render(<MenuPage />);
    const backInStock = await screen.findByText("Back in stock");
    fireEvent.click(backInStock);

    await waitFor(() => {
      expect(clearDishOutOfStock).toHaveBeenCalledWith("d1");
    });
    expect(screen.queryByText(/Couldn't reach the server/i)).toBeNull();
  });
});

describe("MenuPage starter-category quick-create (D-D0e)", () => {
  // Before this fix, `onCreateStarterCategory` had a bare try/catch that swallowed the error
  // entirely — a dropped connection mid-tap left the chip tappable again with zero indication
  // the create actually failed.
  it("shows a retryable error when createCategory fails", async () => {
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));

    render(<MenuPage />);
    const chip = await screen.findByText("+ Mains");
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    });
  });
});

describe("MenuPage session-expiry on a mutation (LC-D##)", () => {
  // Before this fix, none of withSheet/onCreateStarterCategory/onClearOos checked for a
  // dead-session 401 — unlike this page's own initial-load `refresh()`, which already did — so a
  // mutation hitting a dead session stranded the merchant here with no way back to /login.
  it("signs out instead of showing an inline error when the starter-category create hits a dead session", async () => {
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));

    render(<MenuPage />);
    const chip = await screen.findByText("+ Mains");
    fireEvent.click(chip);

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });

  it("signs out instead of showing an inline error when 'back in stock' hits a dead session", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);
    vi.mocked(clearDishOutOfStock).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));

    render(<MenuPage />);
    const backInStock = await screen.findByText("Back in stock");
    fireEvent.click(backInStock);

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });

  it("signs out instead of showing a sheet error when deleting a category (withSheet) hits a dead session", async () => {
    vi.mocked(listCategories).mockResolvedValue([category({ dishCount: 0 })]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(deleteCategory).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));

    render(<MenuPage />);
    fireEvent.click(await screen.findByText("Edit category"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Your session expired — sign in again.")).toBeNull();
  });
});

describe("MenuPage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(listCategories)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish()]);

    render(<MenuPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Menu");
    expect(listCategories).toHaveBeenCalledTimes(2);
  });
});

describe("A shop's Items screen speaks its own words (merchant web upgrade L2, D-44)", () => {
  afterEach(() => clearBusinessCache());

  it("offers the shop kind's own starting categories", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);

    render(<MenuPage />);

    expect(await screen.findByText("+ Engine")).toBeTruthy();
    expect(screen.queryByText("+ Mains")).toBeNull();
    expect(screen.getByText("Items live inside categories — Engine, Brakes, Electrical, whatever fits your shop. Create one and you can add items straight into it.")).toBeTruthy();
  });

  it("titles the list Items and counts items, in the list and in the editor", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listCategories).mockResolvedValue([category({ name: "Brakes" })]);
    vi.mocked(listDishes).mockResolvedValue([dish({ name: "Brake pads", outOfStock: false })]);

    render(<MenuPage />);

    expect(await screen.findByText("Items")).toBeTruthy();
    expect(screen.getByText("1 category · 1 item")).toBeTruthy();
    expect(screen.getByText("+ Add item here")).toBeTruthy();
    expect(screen.getByText(/as the tabs in your shop/)).toBeTruthy();
    expect(screen.queryAllByText(/dish|menu/i)).toHaveLength(0);

    fireEvent.click(screen.getByText("+ Add an item"));
    expect(screen.getByText("Add an item")).toBeTruthy();
    expect(screen.getByText("ITEM PHOTO")).toBeTruthy();
    expect(screen.queryAllByText(/dish/i)).toHaveLength(0);
  });

  it("a restaurant keeps the drawn words", async () => {
    primeBusiness(merchantProfile());
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);

    render(<MenuPage />);

    expect(await screen.findByText("Menu")).toBeTruthy();
    expect(screen.getByText("1 category · 1 dish")).toBeTruthy();
    expect(screen.getByText("+ Add a dish")).toBeTruthy();
  });
});

describe("Staff only mark items out of stock and back (merchant web upgrade L4)", () => {
  afterEach(() => clearBusinessCache());

  it("shows the list with stock toggles and none of the owner's editing", async () => {
    primeBusiness(merchantProfile({ businessType: "shop", shopKind: "auto_parts", myRole: "staff" }));
    vi.mocked(listCategories).mockResolvedValue([category({ name: "Brakes" })]);
    vi.mocked(listDishes).mockResolvedValue([dish({ name: "Brake pads", outOfStock: false })]);

    render(<MenuPage />);

    expect(await screen.findByText("Mark items out of stock and back. Only the owner changes the items.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark out of stock" })).toBeTruthy();
    for (const owners of ["Edit", "Edit category", "+ New category", "+ Add an item", "+ Add item here"]) {
      expect(screen.queryByRole("button", { name: owners })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Manage categories" })).toBeNull();
    expect(screen.queryByText(/change the order/)).toBeNull();
  });

  it("an empty list offers Staff no starting categories", async () => {
    primeBusiness(merchantProfile({ myRole: "staff" }));
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);

    render(<MenuPage />);

    expect(await screen.findByText("No dishes yet")).toBeTruthy();
    expect(screen.getByText("The owner adds the dishes here. You'll mark them out of stock and back.")).toBeTruthy();
    expect(screen.queryByText("+ Mains")).toBeNull();
  });
});

describe("Out of stock for how long (merchant web upgrade L5, RM.oos_sheet)", () => {
  it("sends the chosen duration", async () => {
    vi.mocked(listCategories).mockResolvedValue([category()]);
    vi.mocked(listDishes).mockResolvedValue([dish({ outOfStock: false })]);
    vi.mocked(setDishOutOfStock).mockResolvedValue(dish({ outOfStock: true }));

    render(<MenuPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark out of stock" }));
    fireEvent.click(screen.getByRole("radio", { name: "Until I turn it back on" }));
    const confirm = screen.getAllByRole("button", { name: "Mark out of stock" }).at(-1)!;
    fireEvent.click(confirm);

    await waitFor(() => expect(setDishOutOfStock).toHaveBeenCalledWith("d1", "until_back"));
  });
});
