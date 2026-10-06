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
const navCalls: string[] = [];
const mockReplace = jest.fn((href: unknown) => navCalls.push(`replace:${typeof href === "string" ? href : (href as { pathname: string }).pathname}`));
const mockDismissAll = jest.fn(() => navCalls.push("dismissAll"));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, dismissAll: mockDismissAll, push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));
const mockSignIn = jest.fn(async (_s: unknown) => undefined);
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
import { ToastProvider } from "../../src/ui";
import VerifyScreen, { type VerifyScreenProps } from "../verify";

let live: renderer.ReactTestRenderer | null = null;
function mount(props: VerifyScreenProps = {}): renderer.ReactTestRenderer {
  act(() => {
    live = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ToastProvider>
          <VerifyScreen {...props} />
        </ToastProvider>
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
  navCalls.length = 0;
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
    // E2E 2026-10-05 P-8: the resend line must not promise WhatsApp beside "Sent by SMS".
    expect(out).not.toContain("Resend on WhatsApp");
    expect(out).toContain("Send a new code");
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

  it("the C1 rider path goes OTP → the rider side, no priming (D-82 G1)", async () => {
    mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "whatsapp", intent: "rider" };
    mockVerifyOtp.mockResolvedValue(ok);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
    expect(mockReplace).toHaveBeenCalledWith("/rider");
  });

  it("a new account goes to C5 carrying the phone, channel and intent", async () => {
    mockLocalSearchParams = { phone: "+263772451180", deliveryChannel: "whatsapp", intent: "rider" };
    mockVerifyOtp.mockResolvedValue({ ...ok, needsProfile: true });
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/profile/setup", params: { phone: "+263772451180", intent: "rider" } });
    // C-4: the intent rides with the session too, so an app killed on C5 still finishes as a rider.
    expect(mockSignIn).toHaveBeenCalledWith(expect.objectContaining({ needsProfile: true, signupIntent: "rider" }));
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

const okRes = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p", role: "customer", needsProfile: false };

// C-1 (start-up review 2026-10-06): a bare replace left the phone screen under Home.
describe("C4 · signing in clears the stack", () => {
  it("dismisses everything, then lands on Home", async () => {
    mockVerifyOtp.mockResolvedValue(okRes);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(navCalls).toEqual(["dismissAll", "replace:/home"]);
  });

  it("a new account: dismisses everything, then lands on C5", async () => {
    mockVerifyOtp.mockResolvedValue({ ...okRes, needsProfile: true });
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(navCalls).toEqual(["dismissAll", "replace:/profile/setup"]);
    expect(mockSignIn).toHaveBeenCalledWith(expect.not.objectContaining({ signupIntent: expect.anything() }));
  });
});

// C-3: the saved role is wiped by sign-out; a returning rider must not land in the customer app.
describe("C4 · a returning rider with no saved role", () => {
  it("follows the server's role into the rider app", async () => {
    mockVerifyOtp.mockResolvedValue({ ...okRes, role: "rider" });
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockSaveRole).toHaveBeenCalledWith("rider");
    expect(mockReplace).toHaveBeenCalledWith("/rider");
  });

  it("a saved customer role still wins", async () => {
    mockRole = "customer";
    mockVerifyOtp.mockResolvedValue({ ...okRes, role: "rider" });
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockSaveRole).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });
});

// C-5: the screen could get stuck with six full boxes and nothing happening.
describe("C4 · submitting the latest code", () => {
  it("after a non-answer, retyping the same code sends it again", async () => {
    mockVerifyOtp.mockRejectedValueOnce(new ApiError(0, "The network is slow — check your connection and try again.")).mockResolvedValueOnce(okRes);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(text(t)).toContain("The network is slow");
    expect(text(t)).not.toContain("isn’t right");
    // No loop: nothing goes again until the user edits.
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    await type(t, "41821");
    await type(t, "418210");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("after a definitive wrong code, retyping it sends nothing and shows the line again", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(401, "Invalid code", "otp_invalid"));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "000000");
    await type(t, "00000");
    expect(text(t)).not.toContain("isn’t right");
    await type(t, "000000");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(text(t)).toContain("isn’t right. Check the message and try again.");
  });

  it("a code corrected while a request is in flight is sent when it ends", async () => {
    let fail!: (e: unknown) => void;
    mockVerifyOtp.mockImplementationOnce(() => new Promise((_r, rej) => (fail = rej))).mockResolvedValueOnce(okRes);
    const t = mount({ initialCooldownS: 30 });
    await type(t, "000000");
    await type(t, "418210"); // typed (or pasted) while the first is still out
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail(new ApiError(401, "Invalid code", "otp_invalid"));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockVerifyOtp).toHaveBeenCalledTimes(2);
    expect(mockVerifyOtp).toHaveBeenLastCalledWith("+263772451180", "418210");
  });
});

// C-9: the code decides, and a 400 is never "wrong code".
describe("C4 · error codes", () => {
  it("otp_expired switches to 'Send a new code' whatever the message", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(401, "Invalid code", "otp_expired"));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "000000");
    expect(text(t)).toContain("Send a new code");
  });

  it("a 400 shows the server's message, not the wrong-code line", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(400, "A device id is required to create an account."));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(text(t)).toContain("A device id is required to create an account.");
    expect(text(t)).not.toContain("isn’t right");
  });

  it("the device sign-up cap names the wait", async () => {
    mockVerifyOtp.mockRejectedValue(new ApiError(429, "Too many requests — try again later", "device_signup_cap", 7200));
    const t = mount({ initialCooldownS: 30 });
    await type(t, "418210");
    expect(text(t)).toContain("Too many tries. Try again in 2 h.");
    expect(text(t)).not.toContain("isn’t right");
  });
});

// C-7: the code entry has to be reachable by TalkBack / VoiceOver.
describe("C4 · accessibility", () => {
  const boxes = (t: renderer.ReactTestRenderer) =>
    t.root.find((n) => typeof n.props?.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("6-digit code,") && typeof n.props?.onPress === "function");

  it("the six boxes are one element that says how many digits are in", async () => {
    const t = mount({ initialCooldownS: 30 });
    expect(boxes(t).props.accessibilityLabel).toBe("6-digit code, 0 digits entered");
    expect(boxes(t).props.accessibilityElementsHidden).toBeFalsy();
    expect(boxes(t).props.importantForAccessibility).not.toBe("no-hide-descendants");
    await type(t, "418");
    expect(boxes(t).props.accessibilityLabel).toBe("6-digit code, 3 digits entered");
  });

  it("the hidden input is not fully transparent (Android skips opacity 0)", () => {
    const t = mount({ initialCooldownS: 30 });
    const input = t.root.find((n) => n.props?.accessibilityLabel === "6-digit code" && typeof n.props?.onChangeText === "function");
    expect((input.props.style as { opacity: number }).opacity).toBeGreaterThan(0);
  });
});
