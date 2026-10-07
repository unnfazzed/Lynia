// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantDishResponse } from "@lynia/shared";

const dishes = vi.hoisted(() => ({ current: [] as MerchantDishResponse[] }));
vi.mock("../../lib/menu-api", () => ({ listDishes: async () => dishes.current }));

import { SwapPicker } from "./proposer";

afterEach(() => cleanup());

const dish = (over: Partial<MerchantDishResponse>): MerchantDishResponse => ({
  id: "00000000-0000-4000-8000-000000000001",
  categoryId: "00000000-0000-4000-8000-0000000000c1",
  name: "Bakers Inn 700g",
  description: null,
  priceUsd: 1.2,
  photoUrl: "https://signed.example/dish/a.jpg",
  isDraft: false,
  outOfStock: false,
  sortOrder: 0,
  ...over,
});

describe("SwapPicker thumbnails (MJ-RL20 / D7)", () => {
  it("draws the server thumbnail lazily, and falls back to the full photo for a dish with no thumb yet", async () => {
    dishes.current = [
      dish({ name: "Bakers Inn 700g", thumbUrl: "https://signed.example/dish/a.jpg.thumb.jpg" }),
      dish({ id: "00000000-0000-4000-8000-000000000002", name: "Proton 700g", photoUrl: "https://signed.example/dish/b.jpg" }),
    ];
    render(
      <SwapPicker
        item={{ dishId: "00000000-0000-4000-8000-000000000009", name: "Lobels 700g", priceUsd: 1.1, quantity: 1, note: null, available: null }}
        onPick={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await screen.findByText("Proton 700g");
    const imgs = Array.from(document.querySelectorAll("img"));
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["https://signed.example/dish/a.jpg.thumb.jpg", "https://signed.example/dish/b.jpg"]);
    expect(imgs.every((i) => i.getAttribute("loading") === "lazy" && i.getAttribute("decoding") === "async")).toBe(true);
  });

  it("a thumbnail that fails to load falls back to the full photo once (D7 review)", async () => {
    dishes.current = [dish({ name: "Bakers Inn 700g", thumbUrl: "https://signed.example/dish/a.jpg.thumb.jpg" })];
    render(
      <SwapPicker
        item={{ dishId: "00000000-0000-4000-8000-000000000009", name: "Lobels 700g", priceUsd: 1.1, quantity: 1, note: null, available: null }}
        onPick={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await screen.findByText("Bakers Inn 700g");
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")!.getAttribute("src")).toBe("https://signed.example/dish/a.jpg");
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")!.getAttribute("src")).toBe("https://signed.example/dish/a.jpg");
  });
});
