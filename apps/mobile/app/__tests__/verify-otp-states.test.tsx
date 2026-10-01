/**
 * C4 · Code (Calm Mint v2, packages/design/handoff/calm-mint-v2-2026-10; ledger D-55): six boxes, no
 * Verify button — the sixth digit submits; "Resend in m:ss" then "Resend on WhatsApp"; a wrong code
 * shows the danger line; an expired / locked code shows "That code has expired" and "Send a new code".
 * The channel line follows the real send (D-40): "Sent on WhatsApp" or, on Bird's fallback, "Sent by SMS".
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

let mockLocalSearchParams: { phone: string; deliveryChannel?: string; intent?: string; devCode?: string } = { phone: "+263772451180" };
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));
const mockSignIn = jest.fn(async () => undefined);
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
const mockVerifyOtp = jest.fn();
jest.mock("../../src/api/auth", () => ({
  requestOtp: jest.fn(async () => ({ deliveryChannel: "whatsapp" })),
  verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
}));
let mockRole: string | null = null;
const mockSaveRole = jest.fn(async (_role: string) => undefined);
jest.mock("../../src/auth/session", () => ({
  loadRolePreference: async () => mockRole,
  saveRolePreference: (r: string) => mockSaveRole(r),
}));

import { ApiError } from "../../src/api/client";
import VerifyScreen, { type VerifyScreenProps } from "../verify";

let live: renderer.ReactTestRenderer | null = null;
function mount(props: VerifyScreenProps = {}): renderer.ReactTestRenderer {
  act(() => {
    live = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <VerifyScreen {...props} />
      </SafeAreaProvider>,
    );
  });
  return live!;
}
const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
async function type(t: renderer.ReactTestRenderer, value: string): Promise<void> {
  const input = t.root.find((n) => n.props?.accessibilityLabel === "6-digit code" && typeof n.props?.onChangeText === "function");
  await act(async () => {
    (input.props.onChangeText as (v: string) => void)(value);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "whatsapp" };
  mockRole = null;
});
afterEach(() => {
  if (live) act(() => live!.unmount());
  live = null;
  jest.clearAllMocks();
});

describe("C4 · Code — drawn states", () => {
  it("idle: the drawn copy, six boxes, no Verify button", () => {
    const out = text(mount({ initialCooldownS: 42 }));
    expect(out).toContain("Enter the code");
    expect(out).toContain("WhatsApp");
    expect(out).toContain("+263 77 245 1180");
    expect(out).toContain("Change");
    expect(out).toContain("Resend in 0:42");
    expect(out).toContain("Resend on WhatsApp");
    expect(out).toContain("Fills in by itself when the message arrives. We check it automatically.");
    expect(out).not.toContain("Verify");
  });

  it("locked: 'That code has expired' and 'Send a new code', no countdown", () => {
    const out = text(mount({ initialLocked: true, initialCooldownS: 42 }));
    expect(out).toContain("That code has expired");
    expect(out).toContain("Send a new code");
    expect(out).not.toContain("0:42");
  });

  it("says 'Sent by SMS' when Bird fell back to SMS (D-40)", () => {
    mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "sms" };
    const out = text(mount({ initialCooldownS: 0 }));
    expect(out).toContain("Sent by ");
    expect(out).toContain("SMS");
  });
});

describe("C4 · Code — the sixth digit verifies", () => {
  const ok = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p", role: "customer", needsProfile: false };

  it("a returning account with no saved role starts as a customer on Home", async () => {
    mockVerifyOtp.mockResolvedValue(ok);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "41821");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    await type(t, "418210");
    expect(mockVerifyOtp).toHaveBeenCalledWith("+263772451180", "418210");
    expect(mockSaveRole).toHaveBeenCalledWith("customer");
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("the C1 rider path primes the rider permissions", async () => {
    mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "whatsapp", intent: "rider" };
    mockVerifyOtp.mockResolvedValue(ok);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
    expect(mockReplace).toHaveBeenCalledWith("/permissions?next=/rider");
  });

  it("a new account goes to C5 carrying the phone, channel and intent", async () => {
    mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "whatsapp", intent: "rider" };
    mockVerifyOtp.mockResolvedValue({ ...ok, needsProfile: true });
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/profile/setup", params: { phone: "+263772451180", deliveryChannel: "whatsapp", intent: "rider" } });
  });

  it("a wrong code shows the danger line and is not resubmitted in a loop", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(401, "Invalid code"));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "000000");
    expect(text(t)).toContain("isn’t right. Check the message and try again.");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });

  it("an expired code switches to 'Send a new code'", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(401, "Code expired — request a new code"));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "000000");
    expect(text(t)).toContain("Send a new code");
  });
});
