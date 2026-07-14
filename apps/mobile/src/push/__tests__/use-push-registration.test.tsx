/**
 * JOURNEY-BUGS: getLastNotificationResponseAsync() returns the SAME cached response on every call
 * until explicitly cleared. This hook is mounted once for the app's whole lifetime (root layout) and
 * re-runs its cold-start effect on every `isRider` change — session hydrating, or a sign-out →
 * different-account sign-in on the same device — so without a clear it replayed the same stale
 * cold-start deep link on every one of those transitions, including into a freshly signed-in
 * DIFFERENT account's session.
 */
import React from "react";
import { act, create } from "react-test-renderer";
import { usePushRegistration } from "../use-push-registration";

const mockPush = jest.fn();
let mockPathname = "/home";
jest.mock("expo-router", () => ({
  router: { push: (to: string) => mockPush(to) },
  usePathname: () => mockPathname,
}));

const mockGetLastResponse = jest.fn();
const mockClearLastResponse = jest.fn(async () => {});
const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));

// Capture the OS/FCM token-rotation listener so tests can fire a rotated token at it.
type TokenListener = (t: { data: unknown }) => void;
let tokenRotationListener: TokenListener | null = null;
const mockPushTokenRemove = jest.fn();
jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
  clearLastNotificationResponseAsync: () => mockClearLastResponse(),
  addNotificationResponseReceivedListener: () => mockAddListener(),
  addPushTokenListener: (fn: TokenListener) => {
    tokenRotationListener = fn;
    return { remove: mockPushTokenRemove };
  },
}));

// Capture the AppState listener (register-retry-on-foreground trigger).
type AppStateListener = (s: string) => void;
let appStateListener: AppStateListener | null = null;
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, cb: AppStateListener) => {
      appStateListener = cb;
      return { remove: jest.fn() };
    },
  },
}));

// Capture the reachability listener (register-retry-on-recovery trigger).
type ReachListener = (reachable: boolean) => void;
let reachListener: ReachListener | null = null;
jest.mock("../../net/reachability", () => ({
  subscribeReachability: (fn: ReachListener) => {
    reachListener = fn;
    return () => {
      reachListener = null;
    };
  },
}));

type RegResult = { registered: true; token: string } | { registered: false; retry: boolean };
const mockRegister = jest.fn<Promise<RegResult>, []>(async () => ({ registered: false, retry: false }));
const mockRegisterRotated = jest.fn(async (t: string) => t as string | null);
const mockUnregister = jest.fn(async (_t: string) => {});
jest.mock("../push", () => ({
  registerForPushNotificationsAsync: () => mockRegister(),
  registerRotatedToken: (t: string) => mockRegisterRotated(t),
  unregisterForPushNotificationsAsync: (t: string) => mockUnregister(t as never),
  pushDestination: (data: { orderId?: string }) => (data?.orderId ? `/order/${data.orderId}` : null),
  pushOnce: (router: { push: (to: string) => void }, currentPathname: string, target: string) => {
    if (currentPathname !== target) router.push(target);
  },
}));

function Harness({ role }: { role: "customer" | "rider" }): null {
  usePushRegistration({ profileId: "p1", role, accessToken: "t" } as never);
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("usePushRegistration cold-start consume-once", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockClearLastResponse.mockClear();
    mockGetLastResponse.mockClear();
    mockPathname = "/home";
    mockGetLastResponse.mockResolvedValue({ notification: { request: { content: { data: { orderId: "o1" } } } } });
  });

  it("routes from the cold-start response once, and clears it so it can't replay", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/order/o1");
    expect(mockClearLastResponse).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it("does NOT replay the stale cold-start response when isRider flips (session hydrating)", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);

    // Simulate the session hydrating into a rider role — the effect's `isRider` dependency changes,
    // re-running the cold-start branch. Before the fix this replayed the same cached response.
    act(() => {
      tree.update(<Harness role="rider" />);
    });
    await flush();

    expect(mockPush).toHaveBeenCalledTimes(1); // still just the one, real navigation
    expect(mockGetLastResponse).toHaveBeenCalledTimes(1); // never read a second time
    tree.unmount();
  });

  it("does NOT replay across a sign-out → different-account sign-in on the same device", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockPush.mockClear();

    // A different account signs in with a different role — same mounted hook, `isRider` flips again.
    // The new account must never be silently deep-linked into the OLD session's order.
    act(() => {
      tree.update(<Harness role="rider" />);
    });
    await flush();

    expect(mockPush).not.toHaveBeenCalled();
    tree.unmount();
  });

  it("does NOT push when the cold-start destination is already the active route", async () => {
    // Regression guard: a duplicate/replayed push tap (or the cold-start deep link) while already
    // sitting on its own destination screen previously stacked a redundant back-stack entry.
    mockPathname = "/order/o1";
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();

    expect(mockPush).not.toHaveBeenCalled();
    tree.unmount();
  });
});

// Resilience: a one-shot register with a swallow-all catch meant a cold start in a dead zone left push
// dead for the whole app lifetime, and a mid-process token rotation silently killed it. These cover the
// retry-on-recovery/foreground path and the rotation re-registration.
describe("usePushRegistration resilience", () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockRegisterRotated.mockClear();
    mockUnregister.mockClear();
    mockPushTokenRemove.mockClear();
    tokenRotationListener = null;
    appStateListener = null;
    reachListener = null;
    mockPathname = "/home";
    mockGetLastResponse.mockReset();
    mockGetLastResponse.mockResolvedValue(null);
  });

  it("retries registration when the API becomes reachable again after a transient failure", async () => {
    // First attempt: token acquired but the register POST failed (dead zone) → retry:true.
    mockRegister.mockResolvedValueOnce({ registered: false, retry: true });
    // Recovery attempt: succeeds.
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok-1" });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(reachListener).not.toBeNull(); // retry triggers armed

    // Reachability flips back — the store fires true.
    act(() => {
      reachListener?.(true);
    });
    await flush();

    expect(mockRegister).toHaveBeenCalledTimes(2);
    act(() => {
      tree.unmount();
    });
    // The now-registered token is dropped on teardown.
    expect(mockUnregister).toHaveBeenCalledWith("tok-1");
  });

  it("also retries on a foreground transition", async () => {
    mockRegister.mockResolvedValueOnce({ registered: false, retry: true });
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok-2" });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(appStateListener).not.toBeNull();

    act(() => {
      appStateListener?.("active");
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(2);

    // A non-active transition doesn't trigger a retry.
    act(() => {
      appStateListener?.("background");
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(2);
    tree.unmount();
  });

  it("does NOT arm retry triggers for a terminal failure (permission denied / simulator / Expo Go)", async () => {
    mockRegister.mockResolvedValue({ registered: false, retry: false });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();

    expect(mockRegister).toHaveBeenCalledTimes(1);
    // No recovery listener retained → a later reachability flip can't re-fire.
    expect(reachListener).toBeNull();
    tree.unmount();
  });

  it("stops retrying after the capped budget so it can't hammer the server", async () => {
    mockRegister.mockResolvedValue({ registered: false, retry: true }); // always transient-fails

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Drive many recovery events; retries must stop once the budget (MAX_REGISTER_RETRIES=4) is spent.
    for (let i = 0; i < 12; i++) {
      act(() => {
        reachListener?.(true);
      });
      await flush();
    }
    // 1 initial + at most 4 retries.
    expect(mockRegister).toHaveBeenCalledTimes(5);
    tree.unmount();
  });

  it("re-registers the fresh token on an OS/FCM token rotation and drops the superseded one", async () => {
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok-old" });

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(tokenRotationListener).not.toBeNull();

    // OS hands us a rotated token mid-process.
    act(() => {
      tokenRotationListener?.({ data: "tok-new" });
    });
    await flush();

    expect(mockRegisterRotated).toHaveBeenCalledWith("tok-new");
    // The old, now-dead token is unregistered server-side.
    expect(mockUnregister).toHaveBeenCalledWith("tok-old");

    act(() => {
      tree.unmount();
    });
    // Teardown unregisters the CURRENT (rotated) token, not the stale one again.
    expect(mockUnregister).toHaveBeenLastCalledWith("tok-new");
  });

  it("ignores a rotation event carrying a non-string token", async () => {
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok-old" });
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();

    act(() => {
      tokenRotationListener?.({ data: { endpoint: "web-shape" } });
    });
    await flush();
    expect(mockRegisterRotated).not.toHaveBeenCalled();
    tree.unmount();
  });
});
