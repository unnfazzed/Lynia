// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SetupPage from "./page";
import { listBookings } from "../../lib/bookings-api";
import { getMerchantProfile, listDishes } from "../../lib/menu-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), listDishes: vi.fn() }));
vi.mock("../../lib/bookings-api", () => ({ listBookings: vi.fn() }));

// One stable value, as the real provider memoizes it: the page's load depends on `signOut`, so a fresh
// function per render would re-run the load on every render.
vi.mock("../../components/KitchenConnectionProvider", () => {
  const value = { alarm: { testRing: vi.fn() }, signOut: vi.fn() };
  return { useKitchenConnection: () => value };
});

// The shell (the restaurant's kitchen, and from L2 the shop's own nav); a stand-in makes "is it there?" a
// one-line check.
vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div data-testid="kitchen-shell">{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/setup is type-aware (merchant web upgrade L1)", () => {
  it("a shop gets its own checklist in its own shell, with no go-live promise (API that can't book riders yet)", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }));
    vi.mocked(listDishes).mockResolvedValue([]);

    render(<SetupPage />);

    expect(await screen.findByText("Set up Mbare Auto Spares")).toBeTruthy();
    expect(screen.getByText("Car parts · Shop")).toBeTruthy();
    expect(screen.getByText("Your pin and landmark")).toBeTruthy();
    expect(screen.getByText("Book your first rider")).toBeTruthy();
    // Only booking waits on the API; items are live work from L2.
    expect(screen.getAllByText("Coming soon")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Add items" }).getAttribute("href")).toBe("/menu");
    expect(screen.getByText("Customers will find you when LyniaGo Shops opens. We'll check your items first.")).toBeTruthy();
    expect(screen.getByTestId("kitchen-shell")).toBeTruthy();
    expect(screen.queryByText("Test the order alarm")).toBeNull();
    expect(listBookings).not.toHaveBeenCalled();
  });

  it("a shop on an API that books riders gets Book a rider as live work, ticked by its first booking", async () => {
    const shop = merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts", location: null });
    vi.mocked(getMerchantProfile).mockResolvedValue(shop);
    vi.mocked(listDishes).mockResolvedValue([]);
    vi.mocked(listBookings).mockResolvedValue([]);

    render(<SetupPage />);

    expect((await screen.findByRole("link", { name: "Book a rider" })).getAttribute("href")).toBe("/deliveries/new");
    expect(screen.queryByText("Coming soon")).toBeNull();

    cleanup();
    vi.mocked(listBookings).mockResolvedValue([{ id: "b1" } as never]);
    render(<SetupPage />);

    expect((await screen.findByRole("link", { name: "See deliveries" })).getAttribute("href")).toBe("/deliveries");
    expect(screen.getByText("Done. Your bookings are on Deliveries.")).toBeTruthy();
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
