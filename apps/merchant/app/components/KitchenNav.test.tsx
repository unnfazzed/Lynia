// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenNav, tabItems } from "./KitchenNav";
import { useBusiness } from "../lib/business";
import { merchantProfile } from "../testing/fixtures";

vi.mock("../lib/business", () => ({ useBusiness: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("the bottom tab bar (merchant mobile redesign, D-48)", () => {
  it("a restaurant gets Orders · Menu · Money · Account, also while the business is still loading", () => {
    expect(labels(tabItems(null))).toEqual(["Orders", "Menu", "Money", "Account"]);
    expect(labels(tabItems(merchantProfile({ businessType: "restaurant" })))).toEqual(["Orders", "Menu", "Money", "Account"]);
  });

  it("a shop gets the same bar with Inventory (Merchant v2, D-77), and its Orders home is Deliveries", () => {
    const items = tabItems(merchantProfile({ businessType: "shop" }));
    expect(labels(items)).toEqual(["Orders", "Inventory", "Money", "Account"]);
    expect(items.map((i) => i.href)).toEqual(["/deliveries", "/menu", "/statement", "/account"]);
  });

  it("staff don't see Money", () => {
    expect(labels(tabItems(merchantProfile({ myRole: "staff" })))).toEqual(["Orders", "Menu", "Account"]);
  });

  it("marks the current tab", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ businessType: "restaurant" }));
    render(<KitchenNav active="catalog" />);
    expect(screen.getByRole("link", { name: "Menu" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBeNull();
  });
});
