// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider, useKitchenConnection } from "./KitchenConnectionProvider";

/**
 * The signed-in shell's session lane (merchant journey audit 2026-10-07): MJ-L9 (the wake lock), MJ-L13
 * (sign-out revokes the server session), MJ-RL16 (sign-out forgets the branch list).
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const alarm = vi.hoisted(() => ({ armed: false }));
vi.mock("./alarm-singleton", () => ({
  getAlarmController: () => ({
    isArmed: () => alarm.armed,
    isRinging: () => false,
    arm: () => {
      alarm.armed = true;
    },
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../lib/session", async () => {
  const actual = await vi.importActual<typeof import("../lib/session")>("../lib/session");
  return { ...actual, loadMerchantSession: () => session.current };
});
vi.mock("../lib/queue-socket", () => ({
  createMerchantQueueSocket: () => ({ on: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), connected: false }),
}));
vi.mock("../lib/reachability", () => {
  const store = {
    getState: () => ({ reachable: true, attempt: 0, unreachableSinceMs: null }),
    subscribe: () => () => {},
    start: () => {},
    stop: () => {},
  };
  return { getReachabilityStore: () => store };
});
vi.mock("../lib/use-queue-poll", () => {
  const state = { orders: [], loading: false, loaded: true, error: null, refetch: async () => {} };
  return { useQueuePoll: () => state };
});
vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, endMerchantSession: vi.fn() };
});
vi.mock("../lib/branches", async () => {
  const actual = await vi.importActual<typeof import("../lib/branches")>("../lib/branches");
  return { ...actual, clearBranchesCache: vi.fn() };
});

import { endMerchantSession } from "../lib/api-client";
import { clearBranchesCache } from "../lib/branches";

const SESSION = { accessToken: "at", refreshToken: "11111111-1111-4111-8111-111111111111.s", expiresIn: 900, issuedAt: 0, profileId: "p", role: "merchant" };

let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  alarm.armed = false;
  session.current = SESSION;
  request = vi.fn(async () => ({ released: false, release: vi.fn(async () => {}), addEventListener: vi.fn() }));
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function SignOutProbe({ onReady }: { onReady: (signOut: () => void) => void }) {
  const { signOut } = useKitchenConnection();
  onReady(signOut);
  return null;
}

describe("KitchenConnectionProvider — MJ-L9: the wake lock follows the session, not a tap", () => {
  it("holds the screen on straight after a reload, before anyone has touched it", async () => {
    await act(async () => {
      render(
        <KitchenConnectionProvider>
          <div />
        </KitchenConnectionProvider>,
      );
    });
    expect(alarm.armed).toBe(false);
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("asks for nothing while signed out", async () => {
    session.current = null;
    await act(async () => {
      render(
        <KitchenConnectionProvider>
          <div />
        </KitchenConnectionProvider>,
      );
    });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("KitchenConnectionProvider — sign-out", () => {
  it("MJ-L13 + MJ-RL16: revokes the session on the server and forgets the branch list", async () => {
    let signOut!: () => void;
    await act(async () => {
      render(
        <KitchenConnectionProvider>
          <SignOutProbe onReady={(s) => (signOut = s)} />
        </KitchenConnectionProvider>,
      );
    });
    act(() => signOut());
    expect(endMerchantSession).toHaveBeenCalledTimes(1);
    expect(clearBranchesCache).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
