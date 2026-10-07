/**
 * U01 + U03 (customer review 2026-10-07): a page load (web) or deep link (native) that lands anywhere
 * but "/" never mounts app/index.tsx, so nothing made the boot decision.
 *
 * - U01: signed out on a signed-in route (Safari wiped storage, a bookmark, a signed-out push) left the
 *   customer on a dead signed-in screen with no way to sign in. It now lands where a signed-out boot
 *   lands, with the stack cleared.
 * - U03: nobody reported the boot destination, so the splash held for its 20s give-up online and
 *   forever offline. The landing path (or the redirect target) is now the destination.
 */
import renderer, { act } from "react-test-renderer";
import type { Session } from "../../auth/session";
import { isSignedOutRoute } from "../../logic/boot-route";
import { getBootReadiness, resetBootReadinessForTest } from "../boot-readiness";

const calls: string[] = [];
const mockRouter = {
  dismissAll: jest.fn((): void => void calls.push("dismissAll")),
  replace: jest.fn((href: string): void => void calls.push(`replace:${href}`)),
  canDismiss: jest.fn(() => true),
};
let mockPathname = "/";
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPathname }));

let mockAuth: { session: Session | null; loading: boolean } = { session: null, loading: true };
jest.mock("../../auth/auth-context", () => ({ useAuth: () => mockAuth }));

let mockBooting = true;
jest.mock("../boot-phase", () => ({ useBootPhase: () => ({ booting: mockBooting }) }));

let mockOnboardingSeen: Promise<boolean> = Promise.resolve(true);
jest.mock("../prewarm", () => ({ prewarmBootReads: () => ({ onboardingSeen: mockOnboardingSeen }) }));

import { BootRouteWatch } from "../boot-route-watch";

const s: Session = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer" };

let tree: renderer.ReactTestRenderer | null = null;

function mount(): void {
  act(() => {
    tree = renderer.create(<BootRouteWatch />);
  });
}
function rerender(): void {
  act(() => tree!.update(<BootRouteWatch />));
}
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  resetBootReadinessForTest();
  mockPathname = "/";
  mockBooting = true;
  mockAuth = { session: null, loading: true };
  mockOnboardingSeen = Promise.resolve(true);
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe("U01: a signed-out load at a deep path", () => {
  it("sends a returning visitor at /home to the phone screen, clearing the stack, once auth has loaded", async () => {
    mockPathname = "/home";
    mount();
    await flush();
    expect(calls).toEqual([]); // still loading: nothing decided yet
    mockAuth = { session: null, loading: false };
    rerender();
    await flush();
    expect(calls).toEqual(["dismissAll", "replace:/phone"]);
  });

  it("sends a first-time visitor (onboarding not seen) at /order/<id> to onboarding", async () => {
    mockPathname = "/order/o1";
    mockOnboardingSeen = Promise.resolve(false);
    mockAuth = { session: null, loading: false };
    mount();
    await flush();
    expect(calls).toEqual(["dismissAll", "replace:/onboarding"]);
  });

  it("also fires after the boot (a signed-out deep link or push into a running app)", async () => {
    mockBooting = false;
    mockPathname = "/orders";
    mockAuth = { session: null, loading: false };
    mount();
    await flush();
    expect(calls).toEqual(["dismissAll", "replace:/phone"]);
  });

  it("retries while the navigator is not mounted yet instead of giving up", async () => {
    jest.useFakeTimers();
    try {
      let fails = 2;
      mockRouter.replace.mockImplementation((href: string) => {
        if (fails-- > 0) throw new Error("Attempted to navigate before mounting the Root Layout component.");
        calls.push(`replace:${href}`);
      });
      mockPathname = "/home";
      mockAuth = { session: null, loading: false };
      mount();
      await flush();
      expect(calls.filter((c) => c.startsWith("replace"))).toEqual([]);
      act(() => {
        jest.advanceTimersByTime(250);
      });
      expect(calls.filter((c) => c.startsWith("replace"))).toEqual(["replace:/phone"]);
    } finally {
      mockRouter.replace.mockImplementation((href: string): void => void calls.push(`replace:${href}`));
      jest.useRealTimers();
    }
  });

  it.each(["/", "/onboarding", "/phone", "/verify", "/settings/privacy", "/profile/setup", "/force-update", "/permissions"])(
    "leaves the signed-out route %s alone",
    async (path) => {
      mockPathname = path;
      mockAuth = { session: null, loading: false };
      mount();
      await flush();
      expect(calls).toEqual([]);
    },
  );

  it("never redirects a signed-in customer", async () => {
    mockPathname = "/home";
    mockAuth = { session: s, loading: false };
    mount();
    await flush();
    expect(calls).toEqual([]);
  });

  it("leaves a sign-out to the SessionGate (no second redirect)", async () => {
    mockBooting = false;
    mockPathname = "/settings";
    mockAuth = { session: s, loading: false };
    mount();
    mockAuth = { session: null, loading: false };
    rerender();
    await flush();
    expect(calls).toEqual([]);
  });
});

describe("U03: the boot destination of a deep load", () => {
  it("reports a signed-in reload at /order/<id> as the destination, so the splash hands off on the session check", async () => {
    mockPathname = "/order/o1";
    mount();
    expect(getBootReadiness().readyAt.session).toBeNull();
    mockAuth = { session: s, loading: false };
    rerender();
    expect(getBootReadiness().destination).toBe("/order/o1");
    expect(getBootReadiness().readyAt.session).not.toBeNull();
  });

  it("reports /home for a reload at /home, so the splash waits only for Home's own tasks", () => {
    mockPathname = "/home";
    mockAuth = { session: s, loading: false };
    mount();
    expect(getBootReadiness().destination).toBe("/home");
  });

  it("reports the redirect target for a signed-out deep load", async () => {
    mockPathname = "/home";
    mockAuth = { session: null, loading: false };
    mount();
    await flush();
    expect(getBootReadiness().destination).toBe("/phone");
  });

  it("leaves a boot through '/' to app/index.tsx", () => {
    mockPathname = "/";
    mockAuth = { session: s, loading: false };
    mount();
    expect(getBootReadiness().readyAt.session).toBeNull();
  });

  it("reports nothing once the boot has ended", () => {
    mockBooting = false;
    mockPathname = "/order/o1";
    mockAuth = { session: s, loading: false };
    mount();
    expect(getBootReadiness().readyAt.session).toBeNull();
  });
});

describe("isSignedOutRoute", () => {
  it("knows the sign-in flow and ignores a trailing slash", () => {
    expect(isSignedOutRoute("/phone/")).toBe(true);
    expect(isSignedOutRoute("/home")).toBe(false);
    expect(isSignedOutRoute("/settings")).toBe(false);
    expect(isSignedOutRoute("/order/abc")).toBe(false);
  });
});
