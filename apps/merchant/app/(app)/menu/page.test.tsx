// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import MenuPage from "./page";
import { ApiError } from "../../lib/api-client";
import { clearDishOutOfStock, createCategory, listCategories, listDishes } from "../../lib/menu-api";

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

describe("MenuPage starter-category quick-create (LC-D05)", () => {
  // Before this fix, `onCreateStarterCategory` had a bare try/catch that swallowed the error —
  // a dropped connection mid-tap just left the chip tappable again with no indication anything
  // failed.
  it("shows a retryable error when createCategory fails", async () => {
    vi.mocked(listCategories).mockResolvedValue([]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockRejectedValue(new ApiError(0, "Couldn't reach the server — check the connection and try again."));

    render(<MenuPage />);
    const mainsChip = await screen.findByText("+ Mains");
    fireEvent.click(mainsChip);

    await waitFor(() => {
      expect(screen.getByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    });
    expect((mainsChip as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears any prior error on a successful retry and refreshes the menu", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce([]).mockResolvedValueOnce([category()]);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(createCategory).mockResolvedValueOnce(category());

    render(<MenuPage />);
    const mainsChip = await screen.findByText("+ Mains");
    fireEvent.click(mainsChip);

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith({ name: "Mains" });
    });
    await waitFor(() => {
      expect(screen.queryByText("+ Mains")).toBeNull();
    });
    expect(screen.queryByText(/Couldn't reach the server/i)).toBeNull();
  });
});
