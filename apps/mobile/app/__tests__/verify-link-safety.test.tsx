/**
 * The code screen is reachable by a link (`lynia://verify?…`, and /verify on the web). Nothing in the URL
 * may prefill or submit a code, and a device that is already signed in is never switched to another
 * account from here: a test build's code comes from the phone screen in memory only.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

let mockLocalSearchParams: Record<string, string> = {};
const navCalls: string[] = [];
const mockReplace = jest.fn((href: unknown) => navCalls.push(`replace:${typeof href === "string" ? href : (href as { pathname: string }).pathname}`));
const mockDismissAll = jest.fn(() => navCalls.push("dismissAll"));
const mockRouter = { back: jest.fn(), replace: mockReplace, dismissAll: mockDismissAll, push: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockLocalSearchParams,
}));
const mockSignIn = jest.fn(async (_s: unknown) => undefined);
let mockAuth: { session: object | null; loading: boolean } = { session: null, loading: false };
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ signIn: mockSignIn, ...mockAuth }) }));
const mockVerifyOtp = jest.fn();
jest.mock("../../src/api/auth", () => ({
  requestOtp: jest.fn(async () => ({ deliveryChannel: "sms" })),
  verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
}));
let mockRole: string | null = null;
jest.mock("../../src/auth/device-state", () => ({
  loadSignupIntent: async () => null,
  clearSignupIntent: async () => undefined,
}));
jest.mock("../../src/auth/session", () => ({
  loadRolePreference: async () => mockRole,
  saveRolePreference: async () => undefined,
}));

// The permission screens after sign-up (D-109) are tested in signup-permissions.test.ts: here sign-in lands
// where it's going, unless a test sets the permission route.
let mockPermRoute: string | null = null;
const mockAfterSignInCalls: string[] = [];
jest.mock("../../src/logic/signup-permissions", () => ({
  afterSignIn: async (dest: string) => {
    mockAfterSignInCalls.push(dest);
    return mockPermRoute ?? dest;
  },
}));

import { clearDevCode, peekDevCode, stashDevCode } from "../../src/auth/dev-code-handoff";
import { ToastProvider } from "../../src/ui";
import VerifyScreen from "../verify";

const PHONE = "+263772451180";
const ok = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p", role: "customer", needsProfile: false };

let live: renderer.ReactTestRenderer | null = null;
async function mount(): Promise<renderer.ReactTestRenderer> {
  await act(async () => {
    live = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ToastProvider>
          <VerifyScreen initialCooldownS={30} />
        </ToastProvider>
      </SafeAreaProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
  return live!;
}
const codeInput = (t: renderer.ReactTestRenderer) =>
  t.root.find((n) => n.props?.accessibilityLabel === "6-digit code" && typeof n.props?.onChangeText === "function");
const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());

beforeEach(() => {
  mockLocalSearchParams = { phone: PHONE, deliveryChannel: "sms" };
  mockAuth = { session: null, loading: false };
  mockRole = null;
  navCalls.length = 0;
  mockVerifyOtp.mockResolvedValue(ok);
});
afterEach(() => {
  if (live) act(() => live!.unmount());
  live = null;
  clearDevCode();
  jest.clearAllMocks();
  mockPermRoute = null;
  mockAfterSignInCalls.length = 0;
});

describe("C4 · a code in the URL is inert", () => {
  it("a devCode param prefills nothing and submits nothing", async () => {
    mockLocalSearchParams = { phone: PHONE, deliveryChannel: "sms", devCode: "123456" };
    const t = await mount();
    expect(codeInput(t).props.value).toBe("");
    expect(text(t)).not.toContain("Test build: code pre-filled.");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("a code kept for a different number is not used", async () => {
    stashDevCode("+263770000000", "123456");
    const t = await mount();
    expect(codeInput(t).props.value).toBe("");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});

describe("C4 · a test build's code from the phone screen", () => {
  it("prefills, says so, submits once, and is consumed", async () => {
    stashDevCode(PHONE, "123456");
    const t = await mount();
    expect(text(t)).toContain("Test build: code pre-filled.");
    expect(mockVerifyOtp).toHaveBeenCalledWith(PHONE, "123456");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(peekDevCode(PHONE)).toBeNull();
    expect(navCalls).toEqual(["dismissAll", "replace:/home"]);
  });

  it("a stale code is dropped", async () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    stashDevCode(PHONE, "123456");
    spy.mockReturnValue(now + 11 * 60 * 1000);
    expect(peekDevCode(PHONE)).toBeNull();
    spy.mockRestore();
  });
});

describe("C4 · reached while already signed in", () => {
  it("never verifies or signs in; hands over to the signed-in destination", async () => {
    mockAuth = { session: { profileId: "me", role: "customer" }, loading: false };
    stashDevCode(PHONE, "123456");
    const t = await mount();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(navCalls).toEqual(["dismissAll", "replace:/home"]);
    // A typed code does nothing either.
    await act(async () => {
      (codeInput(t).props.onChangeText as (v: string) => void)("654321");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("decides once auth has loaded (a cold-start link), honouring the saved role", async () => {
    mockAuth = { session: null, loading: true };
    mockRole = "rider";
    const t = await mount();
    expect(navCalls).toEqual([]);
    mockAuth = { session: { profileId: "me", role: "rider" }, loading: false };
    await act(async () => {
      t.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <ToastProvider>
            <VerifyScreen initialCooldownS={30} />
          </ToastProvider>
        </SafeAreaProvider>,
      );
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(navCalls[navCalls.length - 1]).toMatch(/^replace:\/(rider|home)$/);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("this screen's own sign-in (the session committing) is not bounced", async () => {
    const t = await mount();
    await act(async () => {
      (codeInput(t).props.onChangeText as (v: string) => void)("418210");
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(navCalls).toEqual(["dismissAll", "replace:/home"]);
    // The session lands after this screen navigated: no second, competing redirect.
    mockAuth = { session: { profileId: "p", role: "customer" }, loading: false };
    await act(async () => {
      t.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <ToastProvider>
            <VerifyScreen initialCooldownS={30} />
          </ToastProvider>
        </SafeAreaProvider>,
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(navCalls).toEqual(["dismissAll", "replace:/home"]);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
