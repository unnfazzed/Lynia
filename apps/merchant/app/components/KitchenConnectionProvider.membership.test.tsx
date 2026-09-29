// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider } from "./KitchenConnectionProvider";
import { hasKnownBusiness } from "../lib/business";

/**
 * Merchant web upgrade L4 ("Shared devices"): removing someone signs them out on their next tap and stops
 * their device's order alarm, so a shared counter tablet goes back to "Sign in" for the next person.
 */

const { replace, stop, captured } = vi.hoisted(() => ({
  replace: vi.fn(),
  stop: vi.fn(),
  captured: { listener: null as null | (() => void) },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("./alarm-singleton", () => ({
  getAlarmController: () => ({ isArmed: () => false, isRinging: () => false, arm: vi.fn(), start: vi.fn(), stop }),
}));
vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return {
    ...actual,
    onMembershipLost: (listener: () => void) => {
      captured.listener = listener;
      return () => {
        captured.listener = null;
      };
    },
  };
});
vi.mock("../lib/business", async () => {
  const actual = await vi.importActual<typeof import("../lib/business")>("../lib/business");
  return { ...actual, hasKnownBusiness: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KitchenConnectionProvider — someone removed from the team", () => {
  it("signs a known member out and stops the alarm on their next request", () => {
    vi.mocked(hasKnownBusiness).mockReturnValue(true);
    render(
      <KitchenConnectionProvider>
        <div />
      </KitchenConnectionProvider>,
    );
    expect(captured.listener).not.toBeNull();
    act(() => captured.listener!());
    expect(stop).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("leaves a number that never had a business to the screen that asked (the sign-up)", () => {
    vi.mocked(hasKnownBusiness).mockReturnValue(false);
    render(
      <KitchenConnectionProvider>
        <div />
      </KitchenConnectionProvider>,
    );
    act(() => captured.listener!());
    expect(stop).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("stops listening when the shell goes away", () => {
    vi.mocked(hasKnownBusiness).mockReturnValue(true);
    const { unmount } = render(
      <KitchenConnectionProvider>
        <div />
      </KitchenConnectionProvider>,
    );
    unmount();
    expect(captured.listener).toBeNull();
  });
});
