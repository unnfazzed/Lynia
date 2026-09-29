// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupBanner } from "./SetupBanner";
import { getMerchantProfile, listDishes } from "../lib/menu-api";
import { merchantProfile } from "../testing/fixtures";

vi.mock("../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), listDishes: vi.fn() }));
vi.mock("./KitchenConnectionProvider", () => {
  const value = { session: { accessToken: "a" } };
  return { useKitchenConnection: () => value };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("The way into /setup", () => {
  it("nudges the owner while the checklist is unfinished", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile());
    vi.mocked(listDishes).mockResolvedValue([]);
    render(<SetupBanner />);
    expect(await screen.findByRole("link", { name: "Finish setting up" })).toBeTruthy();
  });

  it("says nothing to Staff: setting up is the owner's (merchant web upgrade L4)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ myRole: "staff" }));
    vi.mocked(listDishes).mockResolvedValue([]);
    const { container } = render(<SetupBanner />);
    await vi.waitFor(() => expect(listDishes).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });
});
