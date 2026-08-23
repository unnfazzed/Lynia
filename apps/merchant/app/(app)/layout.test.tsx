// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";
import type { MerchantSession } from "../lib/session";

/**
 * CF-05 (crash-fuzz 2026-08-23): `SessionGuard` used to gate its sign-out check on a `checkedOnce`
 * ref ("skip the effect's first invocation"), assuming the effect only ever runs once per real
 * mount. React 18 StrictMode double-invokes mount effects synchronously before any state update
 * from the first invocation has flowed through a render — so the ref was already flipped to `true`
 * by the second invocation, which read the still-stale `session === null` and called `signOut()`
 * on a rider who had just signed in. Live-verified via a captured stack trace
 * (`SessionGuard.useEffect → KitchenConnectionProvider.signOut → clearMerchantSession`); 100%
 * reproducible under `next dev` (which runs StrictMode). Reproduced here directly with React's own
 * `<StrictMode>` wrapper — no timing hacks needed, since StrictMode's double-invoke is exactly the
 * mechanism at fault.
 */

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock("../components/alarm-singleton", () => {
  class FakeAlarmController {
    isArmed(): boolean {
      return false;
    }
    isRinging(): boolean {
      return false;
    }
    arm(): void {}
    start(): void {}
    stop(): void {}
  }
  const controller = new FakeAlarmController();
  return { getAlarmController: () => controller };
});

let mockSession: MerchantSession | null = null;
const mockClearMerchantSession = vi.fn();
vi.mock("../lib/session", () => ({
  loadMerchantSession: () => mockSession,
  clearMerchantSession: () => mockClearMerchantSession(),
  saveMerchantSession: vi.fn(),
  SESSION_COOKIE: "lynia_merchant_session",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockSession = null;
});

function validSession(): MerchantSession {
  return {
    accessToken: "at",
    refreshToken: "rt",
    expiresIn: 3600,
    issuedAt: Date.now(),
    profileId: "merchant-1",
    role: "merchant",
  };
}

describe("app/(app)/layout.tsx SessionGuard — CF-05 (crash-fuzz 2026-08-23)", () => {
  it("under StrictMode's double-invoked mount effect, a rider who IS signed in is never signed back out", async () => {
    mockSession = validSession();

    await act(async () => {
      render(
        <StrictMode>
          <AppLayout>
            <div>protected content</div>
          </AppLayout>
        </StrictMode>,
      );
      // Flush the microtask queue so any effect-scheduled state update settles.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearMerchantSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/login");
  });

  it("still signs out a genuinely absent session, once the check has actually resolved", async () => {
    mockSession = null;

    await act(async () => {
      render(
        <StrictMode>
          <AppLayout>
            <div>protected content</div>
          </AppLayout>
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearMerchantSession).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
