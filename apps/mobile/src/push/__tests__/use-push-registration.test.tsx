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
jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
  clearLastNotificationResponseAsync: () => mockClearLastResponse(),
  addNotificationResponseReceivedListener: () => mockAddListener(),
}));

jest.mock("../push", () => ({
  registerForPushNotificationsAsync: async () => null,
  unregisterForPushNotificationsAsync: async () => {},
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
