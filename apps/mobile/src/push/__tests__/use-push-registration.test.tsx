import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import { usePushRegistration } from "../use-push-registration";

const mockPush = jest.fn();
let mockPathname = "/home";
jest.mock("expo-router", () => ({
  router: { push: (to: string) => mockPush(to) },
  usePathname: () => mockPathname,
}));

// Capture the warm-tap response listener so tests can fire a notification response at it directly.
type ResponseListener = (r: { notification: { request: { content: { data: unknown } } } }) => void;
let responseListener: ResponseListener | null = null;
const mockResponseListenerRemove = jest.fn();
const mockAddListener = jest.fn((fn: ResponseListener) => {
  responseListener = fn;
  return { remove: mockResponseListenerRemove };
});

// Capture the OS/FCM token-rotation listener so tests can fire a rotated token at it.
type TokenListener = (t: { data: unknown }) => void;
let tokenRotationListener: TokenListener | null = null;
const mockPushTokenRemove = jest.fn();
// Capture the ARRIVAL listener (distinct from the tap/response listener above) — the one that keeps a
// walled screen current without a manual refresh when an account-standing push lands.
type ReceivedListener = (n: { request: { content: { data: unknown } } }) => void;
let receivedListener: ReceivedListener | null = null;
const mockReceivedRemove = jest.fn();
jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: (fn: ResponseListener) => mockAddListener(fn),
  addNotificationReceivedListener: (fn: ReceivedListener) => {
    receivedListener = fn;
    return { remove: mockReceivedRemove };
  },
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

// B-O7: the initial register attempt is deferred behind a real setTimeout (see
// use-push-registration.ts), so this whole file needs fake timers to drive it deterministically.
jest.useFakeTimers();

function Inner({ role }: { role: "customer" | "rider" }): null {
  usePushRegistration({ profileId: "p1", role, accessToken: "t" } as never);
  return null;
}

// The hook reads the query cache (to invalidate ["me"] when an account-standing push arrives), and in
// the app it mounts as `PushSync` inside the root provider — so the harness supplies one too. A fresh
// client per mount keeps the suites independent; `harnessQc` exposes it so the arrival test can spy on
// the invalidation without reaching into the hook.
let harnessQc: QueryClient | null = null;
function Harness({ role }: { role: "customer" | "rider" }): React.ReactElement {
  const [qc] = React.useState(() => new QueryClient());
  harnessQc = qc;
  return (
    <QueryClientProvider client={qc}>
      <Inner role={role} />
    </QueryClientProvider>
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    // B-O7: the initial register attempt is now deferred behind a boot-priority timer (see
    // use-push-registration.ts) — run it before draining microtasks so every existing call site of
    // this helper keeps observing the same post-attempt state it did before that change.
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("usePushRegistration warm-tap listener", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockResponseListenerRemove.mockClear();
    responseListener = null;
    mockPathname = "/home";
  });

  it("routes a warm tap (app already running) to the pushDestination target", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();
    expect(responseListener).not.toBeNull();

    act(() => {
      responseListener?.({ notification: { request: { content: { data: { orderId: "o1" } } } } });
    });
    await flush();

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/order/o1");
    act(() => {
      tree.unmount();
    });
    // Teardown removes the listener so a later-firing native callback can't touch an unmounted tree.
    expect(mockResponseListenerRemove).toHaveBeenCalledTimes(1);
  });

  it("does NOT push when the tap's destination is already the active route", async () => {
    // Regression guard: a duplicate/replayed push tap while already sitting on its own destination
    // screen previously stacked a redundant back-stack entry.
    mockPathname = "/order/o1";
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();

    act(() => {
      responseListener?.({ notification: { request: { content: { data: { orderId: "o1" } } } } });
    });
    await flush();

    expect(mockPush).not.toHaveBeenCalled();
    act(() => {
      tree.unmount();
    });
  });

  it("re-subscribes on an isRider change without duplicating navigation", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="customer" />);
    });
    await flush();

    act(() => {
      tree.update(<Harness role="rider" />);
    });
    await flush();
    expect(mockResponseListenerRemove).toHaveBeenCalledTimes(1); // old listener torn down
    expect(responseListener).not.toBeNull(); // a fresh one is armed

    act(() => {
      responseListener?.({ notification: { request: { content: { data: { orderId: "o1" } } } } });
    });
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});

// Owner instruction (2026-08-16): no manual "Refresh status" anywhere, so an account-standing decision
// has to reach the UI on its own. `kind: "account"` is what the API tags a KYC decision with
// (rider.service.ts `notifyKycDecision`, from BOTH the vendor-webhook and admin-console paths) — the
// exact event that button existed to catch. This is the arrival half (app foregrounded); the screens'
// own `useForegroundRefetch` covers a decision that lands while the app is backgrounded.
describe("usePushRegistration account-standing arrivals", () => {
  beforeEach(() => {
    receivedListener = null;
    mockReceivedRemove.mockClear();
    harnessQc = null;
  });

  it("invalidates ['me'] when an account push ARRIVES, so a walled screen updates with no manual refresh", async () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(receivedListener).not.toBeNull();
    const invalidate = jest.spyOn(harnessQc!, "invalidateQueries");

    act(() => {
      receivedListener?.({ request: { content: { data: { kind: "account" } } } });
    });
    await flush();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] });

    // Teardown removes the listener so a later-firing native callback can't touch an unmounted tree.
    // Measured as a DELTA, not an absolute count: an earlier test in this file unmounts outside `act`,
    // so its cleanup effect can flush during this one and inflate a whole-run total.
    const removesBefore = mockReceivedRemove.mock.calls.length;
    act(() => {
      tree.unmount();
    });
    expect(mockReceivedRemove.mock.calls.length).toBe(removesBefore + 1);
  });

  it("leaves the cache alone for a push that is not about account standing", async () => {
    // Scoping guard: every order/bid push would otherwise force a ["me"] round trip on arrival — a
    // per-notification refetch of an unrelated resource on a metered corridor link.
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    const invalidate = jest.spyOn(harnessQc!, "invalidateQueries");

    act(() => {
      receivedListener?.({ request: { content: { data: { kind: "order", orderId: "o1" } } } });
    });
    await flush();

    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      tree.unmount();
    });
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

  it("does NOT adopt the stale initial token when FCM rotates while the register POST is in flight (race)", async () => {
    // KB-PUSH-TOKEN-RACE: a slow initial registration that resolves AFTER an FCM rotation must not clobber
    // the freshly-bound rotated token — otherwise sign-out cleanup unregisters the dead initial token and
    // leaves the live rotated one bound to the signed-out profile.
    let resolveInitial!: (r: RegResult) => void;
    mockRegister.mockReturnValueOnce(new Promise<RegResult>((res) => (resolveInitial = res)));

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    await flush();
    expect(tokenRotationListener).not.toBeNull();

    // FCM rotates mid-flight; the rotation listener binds the new token.
    act(() => {
      tokenRotationListener?.({ data: "tok-new" });
    });
    await flush();
    expect(mockRegisterRotated).toHaveBeenCalledWith("tok-new");

    // Only NOW the slow initial registration resolves — with the stale, superseded token.
    await act(async () => {
      resolveInitial({ registered: true, token: "tok-old" });
      await Promise.resolve();
    });
    await flush();
    // The stale token is dropped server-side, not adopted as `registered`.
    expect(mockUnregister).toHaveBeenCalledWith("tok-old");

    mockUnregister.mockClear();
    act(() => {
      tree.unmount();
    });
    // Teardown unregisters the CURRENT (rotated) token — never the stale initial one.
    expect(mockUnregister).toHaveBeenCalledWith("tok-new");
    expect(mockUnregister).not.toHaveBeenCalledWith("tok-old");
  });

  it("defers the initial register POST a beat behind mount instead of firing immediately (B-O7: cold-boot request prioritization)", async () => {
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok-boot" });
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Harness role="rider" />);
    });
    // Mount alone must NOT fire the register attempt yet — it's deferred so the boot-critical
    // /app/bootstrap aggregate (PushSync's sibling in app/_layout.tsx) gets a head start on the
    // connection instead of racing it for bandwidth.
    expect(mockRegister).not.toHaveBeenCalled();

    // Only once the boot-priority timer elapses does the attempt actually fire.
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    act(() => {
      tree.unmount();
    });
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
