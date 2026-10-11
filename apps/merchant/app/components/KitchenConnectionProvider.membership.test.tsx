// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider } from "./KitchenConnectionProvider";
import { hasKnownBusiness } from "../lib/business";
import { takeSignOutNotice } from "../lib/session";
import { noBusinessPath } from "../lib/team-api";

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
// MJ-L1: where a number that isn't on a business goes (Join when an invite waits for it).
vi.mock("../lib/team-api", () => ({ noBusinessPath: vi.fn(async () => "/join") }));

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
    // MJ-L2: and the sign-in screen says why.
    expect(takeSignOutNotice()).toBe("removed");
  });

  it("MJ-L1: sends a number that never had a business to Join / the sign-up — not to 'check your data connection'", async () => {
    vi.mocked(hasKnownBusiness).mockReturnValue(false);
    render(
      <KitchenConnectionProvider>
        <div />
      </KitchenConnectionProvider>,
    );
    act(() => captured.listener!());
    act(() => captured.listener!()); // the queue poll's refusal too: one move
    expect(stop).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/join"));
    expect(noBusinessPath).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(takeSignOutNotice()).toBeNull();
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
