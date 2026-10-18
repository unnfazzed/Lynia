// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MerchantShopFront } from "../lib/adminTypes";
import { ShopFrontCard } from "./ShopFrontCard";

afterEach(cleanup);

const CLOSED = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => ({ day, open: null, close: null }));

function front(over: Partial<MerchantShopFront> = {}): MerchantShopFront {
  return {
    logoUrl: "https://signed.example/logo.jpg",
    coverPhotoUrl: "https://signed.example/cover.jpg",
    hasLogo: true,
    hasCover: true,
    about: "Sadza and stew since 1998.",
    tags: ["Zimbabwean", "Grill"],
    priceLevel: 2,
    hours: CLOSED.map((h) => (h.day === "mon" ? { day: "mon", open: "08:00", close: "20:00" } : h)),
    itemCount: 14,
    items: [
      { id: "d1", name: "Sadza & beef", category: "Mains", priceUsd: "4.50", photoUrl: "https://signed.example/d1.jpg", hasPhoto: true, draft: false },
      { id: "d2", name: "Maheu", category: "Drinks", priceUsd: "1.00", photoUrl: null, hasPhoto: false, draft: true },
    ],
    ...over,
  };
}

describe("ShopFrontCard (what customers see, reviewed before Approve)", () => {
  it("shows the cover, the logo, the about, tags, price level, hours and the first items", () => {
    render(<ShopFrontCard name="Mama's Kitchen" shopFront={front()} shop={false} />);
    expect(screen.getByRole("img", { name: "Mama's Kitchen cover" }).getAttribute("src")).toBe("https://signed.example/cover.jpg");
    expect(screen.getByRole("img", { name: "Mama's Kitchen logo" }).getAttribute("src")).toBe("https://signed.example/logo.jpg");
    expect(screen.getByText("Sadza and stew since 1998.")).toBeTruthy();
    expect(screen.getByText("Zimbabwean")).toBeTruthy();
    expect(screen.getByText("$$")).toBeTruthy();
    expect(screen.getByText("08:00–20:00")).toBeTruthy();
    expect(screen.getAllByText("Closed")).toHaveLength(6);
    expect(screen.getByText("Menu · first 2 of 14")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Sadza & beef" })).toBeTruthy();
    expect(screen.getByText("No photo")).toBeTruthy();
    expect(screen.getByText("draft")).toBeTruthy();
  });

  it("says plainly what's missing, so ops can ask for it on the call", () => {
    render(
      <ShopFrontCard
        name="Siyaso Parts"
        shop
        shopFront={front({ logoUrl: null, hasLogo: false, coverPhotoUrl: null, hasCover: false, about: null, tags: [], priceLevel: null, hours: CLOSED, itemCount: 0, items: [] })}
      />,
    );
    expect(screen.getByText("No logo")).toBeTruthy();
    expect(screen.getByText("No cover photo")).toBeTruthy();
    expect(screen.getByText("Not written yet")).toBeTruthy();
    expect(screen.getByText("Items · none yet")).toBeTruthy();
    // No hours at all reads as not set, not as closed every day.
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    expect(screen.queryByText("Closed")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("a photo that exists but couldn't be signed reads as a load failure, not as missing", () => {
    render(<ShopFrontCard name="Mama's Kitchen" shop={false} shopFront={front({ logoUrl: null, hasLogo: true })} />);
    expect(screen.getByText("Logo couldn't load")).toBeTruthy();
  });
});
