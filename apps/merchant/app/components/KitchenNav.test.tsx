// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenNav } from "./KitchenNav";
import { useBusiness } from "../lib/business";
import { supportWhatsAppUrl } from "../lib/config";
import { merchantProfile } from "../testing/fixtures";

vi.mock("../lib/business", () => ({ useBusiness: vi.fn() }));
vi.mock("../lib/config", () => ({ supportWhatsAppUrl: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function labels(): string[] {
  return screen.getAllByRole("link").map((a) => a.textContent ?? "");
}

describe("KitchenNav is type-aware (merchant web upgrade L2)", () => {
  it("a restaurant keeps the drawn nav, Help included (L5), also while the business is still loading", () => {
    vi.mocked(useBusiness).mockReturnValue(null);
    vi.mocked(supportWhatsAppUrl).mockReturnValue("https://wa.me/263770000000");
    render(<KitchenNav active="queue" />);
    expect(labels()).toEqual(["Orders", "Menu", "Shop", "Hours", "Statement", "Help"]);
    expect(screen.getByRole("navigation", { name: "Kitchen sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("href")).toBe("https://wa.me/263770000000");

    cleanup();
    vi.mocked(useBusiness).mockReturnValue(merchantProfile());
    render(<KitchenNav active="queue" />);
    expect(labels()).toEqual(["Orders", "Menu", "Shop", "Hours", "Statement", "Help"]);

    // No support number set: Help hides rather than open a dead link.
    cleanup();
    vi.mocked(supportWhatsAppUrl).mockReturnValue(null);
    render(<KitchenNav active="queue" />);
    expect(labels()).toEqual(["Orders", "Menu", "Shop", "Hours", "Statement"]);
  });

  it("a shop gets Deliveries first, its Riders, Items and Shop, and Help on WhatsApp when support's number is set", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ businessType: "shop", shopKind: "pharmacy" }));
    vi.mocked(supportWhatsAppUrl).mockReturnValue("https://wa.me/263770000000");
    render(<KitchenNav active="deliveries" />);

    expect(screen.getByRole("navigation", { name: "Shop sections" })).toBeTruthy();
    expect(labels()).toEqual(["Deliveries", "Riders", "Items", "Shop", "Help"]);
    expect(screen.getByRole("link", { name: "Deliveries" }).getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("link", { name: "Items" }).getAttribute("href")).toBe("/menu");
    const help = screen.getByRole("link", { name: "Help" });
    expect(help.getAttribute("href")).toBe("https://wa.me/263770000000");
    expect(help.getAttribute("target")).toBe("_blank");
  });

  it("hides Help rather than open a dead link when no support number is set", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ businessType: "shop" }));
    vi.mocked(supportWhatsAppUrl).mockReturnValue(null);
    render(<KitchenNav active="deliveries" />);
    expect(labels()).toEqual(["Deliveries", "Riders", "Items", "Shop"]);
  });

  it("Staff get the permission table's nav: a restaurant's Orders, Menu, Hours and Help; a shop's without Shop (L4)", () => {
    vi.mocked(supportWhatsAppUrl).mockReturnValue("https://wa.me/263770000000");
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ myRole: "staff" }));
    render(<KitchenNav active="queue" />);
    expect(labels()).toEqual(["Orders", "Menu", "Hours", "Help"]);

    cleanup();
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ businessType: "shop", myRole: "staff" }));
    render(<KitchenNav active="deliveries" />);
    expect(labels()).toEqual(["Deliveries", "Riders", "Items", "Help"]);

    cleanup();
    vi.mocked(supportWhatsAppUrl).mockReturnValue(null);
    render(<KitchenNav active="deliveries" />);
    expect(labels()).toEqual(["Deliveries", "Riders", "Items"]);
  });
});
