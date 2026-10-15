/**
 * Notifications granted OUTSIDE the app's explainers still bind a push token.
 *
 * A "Don't allow" on the OS dialog is terminal for the registration hook (retry: false), and a few
 * foregrounds before any grant spend its retry budget. Either way, a biker or customer who later turned
 * notifications on in the phone's settings got no token until the next cold start — job offers and
 * order updates never arrived. Every foreground now re-checks the permission and registers once granted.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { usePushRegistration } from "../use-push-registration";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  usePathname: () => "/home",
  useNavigationContainerRef: () => ({ isReady: () => false }),
}));
jest.mock("../../auth/device-state", () => ({ saveRolePreference: jest.fn() }));

const mockGetPermissions = jest.fn();
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => mockGetPermissions(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addPushTokenListener: () => ({ remove: jest.fn() }),
}));

const mockAppStateListeners = new Set<(s: string) => void>();
jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, cb: (s: string) => void) => {
      mockAppStateListeners.add(cb);
      return { remove: () => mockAppStateListeners.delete(cb) };
    },
  },
}));
jest.mock("../../net/reachability", () => ({ subscribeReachability: () => () => undefined }));

type RegResult = { registered: true; token: string } | { registered: false; retry: boolean };
const mockRegister = jest.fn<Promise<RegResult>, []>();
jest.mock("../push", () => ({
  registerForPushNotificationsAsync: () => mockRegister(),
  registerRotatedToken: async (t: string) => t,
  unregisterForPushNotificationsAsync: async () => undefined,
  pushDestination: () => null,
}));

jest.useFakeTimers();

function Inner(): null {
  usePushRegistration({ profileId: "p1", role: "rider", accessToken: "t" } as never);
  return null;
}
function Harness(): React.ReactElement {
  const [qc] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <Inner />
    </QueryClientProvider>
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    jest.runOnlyPendingTimers();
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}
async function foreground(): Promise<void> {
  await act(async () => {
    for (const l of mockAppStateListeners) l("active");
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

let tree: ReactTestRenderer | null = null;
beforeEach(() => {
  mockRegister.mockReset();
  mockGetPermissions.mockReset();
  mockAppStateListeners.clear();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe("usePushRegistration · a grant made in the phone's settings", () => {
  it("registers on the next foreground after a terminal 'Don't allow'", async () => {
    mockRegister.mockResolvedValueOnce({ registered: false, retry: false });
    mockGetPermissions.mockResolvedValue({ granted: false });
    await act(async () => {
      tree = create(<Harness />);
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Still off: a foreground does not try to register.
    await foreground();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Turned on in the phone's settings → back to the app.
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockRegister.mockResolvedValueOnce({ registered: true, token: "tok" });
    await foreground();
    expect(mockRegister).toHaveBeenCalledTimes(2);

    // Bound: later foregrounds do nothing.
    await foreground();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it("never runs two registrations at once when several triggers fire on one foreground", async () => {
    let finish: (r: RegResult) => void = () => undefined;
    mockRegister.mockResolvedValueOnce({ registered: false, retry: true }); // arms the retry triggers too
    mockGetPermissions.mockResolvedValue({ granted: true });
    await act(async () => {
      tree = create(<Harness />);
    });
    await flush();

    mockRegister.mockImplementation(() => new Promise<RegResult>((r) => (finish = r)));
    await foreground();
    expect(mockRegister).toHaveBeenCalledTimes(2);
    await act(async () => finish({ registered: true, token: "tok" }));
  });
});
