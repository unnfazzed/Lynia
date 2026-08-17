/**
 * LC-D-T3 (Lane D journey/soundness sweep, notification/deep-link coherence): a cold-start push tap used
 * to be routed by a SEPARATE effect (usePushRegistration, root layout) calling its own `router.push`,
 * entirely independent of this screen's own `<Redirect>` — both fire a navigation on first mount with no
 * coordination, so whichever resolved second silently won. Since `app/index.tsx`'s own async reads
 * (session load, onboarding flag, role pref) are all local SecureStore/AsyncStorage reads with no
 * inherent ordering guarantee against `getLastNotificationResponseAsync()`, a cold-start tap that opened
 * the order first could be silently clobbered moments later by the boot screen's own default redirect.
 *
 * This test drives the real `index.tsx` (mocking only auth-context/session/push-consumption edges) and
 * asserts: (1) the boot screen holds its splash until the cold-start check resolves — not just the
 * onboarding/role reads — and (2) once resolved, a cold-start deep link wins over the ordinary boot
 * destination in the SAME render, with no separate/racing navigation call involved.
 */
import renderer, { act } from "react-test-renderer";

const mockRedirect = jest.fn((_href: string) => null);
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

let mockSession: { role: string; needsProfile?: boolean } | null = null;
const mockUseAuth = jest.fn(() => ({ session: mockSession, loading: false }));
jest.mock("../../src/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

let resolveOnboarding!: (v: boolean) => void;
let resolveRolePref!: (v: string | null) => void;
jest.mock("../../src/auth/session", () => ({
  loadOnboardingSeen: () => new Promise((res) => (resolveOnboarding = res)),
  loadRolePreference: () => new Promise((res) => (resolveRolePref = res)),
  // The boot reads are now started together by src/boot/prewarm.ts, so the session read is part of
  // this screen's dependency graph even though `Index` itself takes the session from useAuth.
  loadSession: () => Promise.resolve(null),
}));

// The RUM buffer is dormant until start(), so enqueueBoot is already a no-op here — mocked anyway so a
// boot-routing test never depends on telemetry internals.
jest.mock("../../src/telemetry/rum", () => ({ enqueueBoot: jest.fn() }));

let resolveColdStart!: (v: { notification: { request: { content: { data: unknown } } } } | null) => void;
const mockConsumeColdStart = jest.fn(() => new Promise((res) => (resolveColdStart = res)));
jest.mock("../../src/push/push", () => ({
  // Real pushDestination/pushOnce so bootRedirectTarget's routing logic is exercised for real — only
  // the native notification read is faked.
  ...jest.requireActual("../../src/push/push"),
  consumeColdStartResponse: () => mockConsumeColdStart(),
}));

import { __resetBootReads } from "../../src/boot/prewarm";
import Index from "../index";

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("app/index.tsx boot routing", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockConsumeColdStart.mockClear();
    mockSession = null;
    // The boot reads are memoized for the life of the process (one launch, one read). Forget them
    // between cases so each test drives a FRESH set of deferred promises — without this, case 2 would
    // inherit case 1's already-resolved values and assert nothing.
    __resetBootReads();
  });

  it("holds the splash (no Redirect) until the cold-start check resolves, even after onboarding/role are ready", async () => {
    mockSession = { role: "customer", needsProfile: false };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Index />);
    });
    await flush();

    resolveOnboarding(true);
    resolveRolePref("customer");
    await flush();

    // Onboarding + role are both ready, but the cold-start read hasn't resolved yet — must not redirect.
    expect(mockRedirect).not.toHaveBeenCalled();

    resolveColdStart(null);
    await flush();

    expect(mockRedirect).toHaveBeenCalledWith("/home");
    tree.unmount();
  });

  it("a cold-start tap's destination wins over the ordinary boot destination, decided in one pass", async () => {
    mockSession = { role: "customer", needsProfile: false };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Index />);
    });
    await flush();

    resolveOnboarding(true);
    resolveRolePref("customer");
    resolveColdStart({ notification: { request: { content: { data: { orderId: "o1", status: "delivered" } } } } });
    await flush();

    // The default customer destination would be /home; the cold-start tap must win instead.
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/order/o1");
    tree.unmount();
  });

  it("falls back to the ordinary destination when there was no cold-start tap", async () => {
    mockSession = { role: "rider", needsProfile: false };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Index />);
    });
    await flush();

    resolveOnboarding(true);
    resolveRolePref("rider");
    resolveColdStart(null);
    await flush();

    expect(mockRedirect).toHaveBeenCalledWith("/rider");
    tree.unmount();
  });
});
