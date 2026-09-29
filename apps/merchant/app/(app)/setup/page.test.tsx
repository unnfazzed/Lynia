// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SetupPage from "./page";
import { getMerchantProfile, listDishes } from "../../lib/menu-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), listDishes: vi.fn() }));

// One stable value, as the real provider memoizes it: the page's load depends on `signOut`, so a fresh
// function per render would re-run the load on every render.
vi.mock("../../components/KitchenConnectionProvider", () => {
  const value = { alarm: { testRing: vi.fn() }, signOut: vi.fn() };
  return { useKitchenConnection: () => value };
});

// The kitchen shell is the restaurant's chrome; a stand-in makes "is it there?" a one-line check.
vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div data-testid="kitchen-shell">{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/setup is type-aware (merchant web upgrade L1)", () => {
  it("a shop gets its own checklist, outside the kitchen shell, with no go-live promise", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listDishes).mockResolvedValue([]);

    render(<SetupPage />);

    expect(await screen.findByText("Set up Mbare Auto Spares")).toBeTruthy();
    expect(screen.getByText("Car parts · Shop")).toBeTruthy();
    expect(screen.getByText("Your pin and landmark")).toBeTruthy();
    expect(screen.getByText("Book your first rider")).toBeTruthy();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.getByText("Customers will find you when LyniaGo Shops opens. We'll check your items first.")).toBeTruthy();
    expect(screen.queryByTestId("kitchen-shell")).toBeNull();
    expect(screen.queryByText("Test the order alarm")).toBeNull();
  });

  it("a restaurant keeps the drawn checklist, and learns when LyniaGo will call to switch it on", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile());
    vi.mocked(listDishes).mockResolvedValue([]);

    render(<SetupPage />);

    expect(await screen.findByText("Set up Test Kitchen")).toBeTruthy();
    expect(screen.getByTestId("kitchen-shell")).toBeTruthy();
    expect(screen.getByText("Test the order alarm")).toBeTruthy();
    expect(screen.getByText("Finish this list and LyniaGo will call you within a day to switch you on. It isn't automatic.")).toBeTruthy();
  });
});
