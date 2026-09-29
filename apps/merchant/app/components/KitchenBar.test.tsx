// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenBar } from "./KitchenBar";
import { useBusiness } from "../lib/business";
import { merchantProfile } from "../testing/fixtures";

// A Wednesday, 12:30 on the tablet's clock.
const NOON = new Date(2026, 8, 30, 12, 30).getTime();

const connection = vi.hoisted(() => ({
  value: {
    reachability: { reachable: true, attempt: 0, unreachableSinceMs: null },
    alarm: { armed: true },
    wakeLock: { supported: true, active: false },
    signOut: () => {},
  },
}));
vi.mock("./KitchenConnectionProvider", () => ({ useKitchenConnection: () => connection.value }));
vi.mock("../lib/business", () => ({ useBusiness: vi.fn() }));
vi.mock("../lib/use-now", () => ({ useNow: () => NOON }));
vi.mock("./PersonMenu", () => ({ PersonMenu: () => <span>person</span> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const HOURS = { wed: { open: "08:00", close: "20:00" } } as unknown as NonNullable<ReturnType<typeof merchantProfile>["hours"]>;

describe("KitchenBar (merchant web upgrade L5)", () => {
  it("names the business and says a live restaurant inside its hours is open for orders", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ name: "Sadza Republic", pilotEnabled: true, hours: HOURS }));
    render(<KitchenBar />);
    expect(screen.getByText("Sadza Republic")).toBeTruthy();
    const pill = screen.getByText("Open for orders");
    expect(pill.getAttribute("data-open")).toBe("true");
  });

  it("says Closed outside the day's hours, and while the restaurant isn't live yet", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ pilotEnabled: true, hours: { wed: { open: "17:00", close: "22:00" } } as typeof HOURS }));
    render(<KitchenBar />);
    expect(screen.getByText("Closed").getAttribute("data-open")).toBe("false");

    cleanup();
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ pilotEnabled: false, hours: HOURS }));
    render(<KitchenBar />);
    expect(screen.getByText("Closed")).toBeTruthy();
  });

  it("a shop gets no open pill and no alarm flashing: it takes no customer orders", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ businessType: "shop", shopKind: "auto_parts", name: "Siyaso Spares" }));
    const { container } = render(<KitchenBar />);
    expect(screen.queryByText("Open for orders")).toBeNull();
    expect(screen.queryByText("Closed")).toBeNull();
    expect(container.querySelector(".kitchen-bar")?.className).not.toContain("kitchen-bar-flashing");
  });

  it("a restaurant whose screen can't be kept awake still flashes the header, as before", () => {
    vi.mocked(useBusiness).mockReturnValue(merchantProfile({ pilotEnabled: true, hours: HOURS }));
    const { container } = render(<KitchenBar />);
    expect(container.querySelector(".kitchen-bar")?.className).toContain("kitchen-bar-flashing");
  });
});
