/**
 * C2 / C3 · Phone (Calm Mint v2, packages/design/handoff/calm-mint-v2-2026-10; ledger D-55): a fixed
 * +263 prefix, the nine national digits grouped as typed, the too-short line on "Send code", and the
 * E.164 number (plus any C1 rider intent) handed to the code screen.
 */
import { tokens } from "@lynia/shared/tokens";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
let mockParams: { intent?: string } = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDismissAll = jest.fn();
let mockNavState: { index: number; routes: { name: string }[] } = { index: 0, routes: [{ name: "phone" }] };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, dismissAll: mockDismissAll, canGoBack: () => true, canDismiss: () => true }),
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ getState: () => mockNavState }),
}));
let mockSession: object | null = null;
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ session: mockSession }) }));
const mockRequestOtp = jest.fn(async (_phone: string): Promise<unknown> => ({ deliveryChannel: "whatsapp", devCode: null }));
jest.mock("../../src/api/auth", () => ({ requestOtp: (...a: unknown[]) => mockRequestOtp(...(a as [string])) }));

import { ApiError } from "../../src/api/client";
import { ToastProvider } from "../../src/ui";
import PhoneScreen from "../phone";

let live: renderer.ReactTestRenderer | null = null;
function mount(): renderer.ReactTestRenderer {
  act(() => {
    live = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ToastProvider>
          <PhoneScreen />
        </ToastProvider>
      </SafeAreaProvider>,
    );
  });
  return live!;
}
const field = (t: renderer.ReactTestRenderer) => t.root.find((n) => n.props?.accessibilityLabel === "Phone number, +263" && typeof n.props?.onChangeText === "function");
const typeIn = (t: renderer.ReactTestRenderer, v: string): void => {
  act(() => {
    (field(t).props.onChangeText as (s: string) => void)(v);
  });
};
async function send(t: renderer.ReactTestRenderer): Promise<void> {
  const btn = t.root.find((n) => n.props?.accessibilityLabel === "Send code" && typeof n.props?.onPress === "function");
  await act(async () => {
    btn.props.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
}
const text = (t: renderer.ReactTestRenderer): string => JSON.stringify(t.toJSON());
/** The field's border: red only for a problem with the number. */
const fieldBorder = (t: renderer.ReactTestRenderer): string => {
  const box = t.root.findAll((n) => n.props?.style?.height === tokens.touchTargetPrimary && n.props?.style?.borderRadius === tokens.radius.input)[0]!;
  return (box.props.style as { borderColor: string }).borderColor;
};

afterEach(() => {
  if (live) act(() => live!.unmount());
  live = null;
  mockParams = {};
  mockSession = null;
  mockNavState = { index: 0, routes: [{ name: "phone" }] };
  jest.clearAllMocks();
});

describe("C2 / C3 · Phone", () => {
  it("draws the +263 prefix and groups the number as typed", () => {
    const t = mount();
    expect(text(t)).toContain("What’s your number?");
    expect(text(t)).toContain("+263");
    expect(text(t)).toContain("Starts with 71, 73, 77 or 78.");
    typeIn(t, "0772451180");
    expect(field(t).props.value).toBe("77 245 1180");
  });

  it("C3: a short number shows the drawn line and sends nothing", async () => {
    const t = mount();
    typeIn(t, "77245118");
    await send(t);
    expect(text(t)).toContain("That number looks short. Zimbabwe mobiles have 9 digits after +263.");
    expect(fieldBorder(t)).toBe(tokens.color.danger);
    expect(mockRequestOtp).not.toHaveBeenCalled();
  });

  it("sends E.164 and carries the rider intent to the code screen", async () => {
    mockParams = { intent: "rider" };
    const t = mount();
    typeIn(t, "77 245 1180");
    await send(t);
    expect(mockRequestOtp).toHaveBeenCalledWith("+263772451180");
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/verify",
      params: { phone: "+263772451180", devCode: "", deliveryChannel: "whatsapp", intent: "rider" },
    });
  });
});

// C-6 (start-up review 2026-10-06): `maxLength={12}` cut a pasted "+263…" before the cleanup ran.
describe("C2 · pasted and autofilled numbers", () => {
  it("has no native maxLength to truncate a paste", () => {
    expect(field(mount()).props.maxLength).toBeUndefined();
  });

  it.each(["+263772451180", "+263 77 245 1180", "263 77 245 1180", "0772451180"])("%s becomes the nine national digits", async (pasted) => {
    const t = mount();
    typeIn(t, pasted);
    expect(field(t).props.value).toBe("77 245 1180");
    await send(t);
    expect(mockRequestOtp).toHaveBeenCalledWith("+263772451180");
  });
});

// C-8: "Send code" and the keypad's submit key, a frame apart, used to send two paid codes.
describe("C2 · one send at a time", () => {
  it("a second submit while the first is in flight sends nothing", async () => {
    let release!: (v: unknown) => void;
    mockRequestOtp.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const t = mount();
    typeIn(t, "772451180");
    await act(async () => {
      field(t).props.onSubmitEditing();
      field(t).props.onSubmitEditing();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockRequestOtp).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ deliveryChannel: "sms", devCode: null });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

// C-9: a failed send that isn't the number's fault is a toast, not the red "your number is wrong" style.
describe("C2 · send failures", () => {
  it("a network failure is a toast; the field stays unflagged", async () => {
    mockRequestOtp.mockRejectedValueOnce(new ApiError(0, "Can't reach LyniaGo — check your connection and try again."));
    const t = mount();
    typeIn(t, "772451180");
    await send(t);
    expect(text(t)).toContain("Can't reach LyniaGo — check your connection and try again.");
    expect(text(t)).toContain("Starts with 71, 73, 77 or 78.");
    expect(fieldBorder(t)).toBe(tokens.color.line);
  });

  it("the send limit names the wait", async () => {
    mockRequestOtp.mockRejectedValueOnce(new ApiError(429, "Too many requests — try again later", "otp_send_limit", 1500));
    const t = mount();
    typeIn(t, "772451180");
    await send(t);
    expect(text(t)).toContain("Too many tries. Try again in 25 min.");
    expect(text(t)).toContain("Starts with 71, 73, 77 or 78.");
    expect(fieldBorder(t)).toBe(tokens.color.line);
  });
});

// C-2: signed out, Back from the phone screen must never reach a signed-in screen.
describe("C2 · Back", () => {
  const pressBack = (t: renderer.ReactTestRenderer): void => {
    const btn = t.root.find((n) => n.props?.accessibilityLabel === "Back" && typeof n.props?.onPress === "function");
    act(() => btn.props.onPress());
  };

  it("signed out with C1 behind it: an ordinary back", () => {
    mockNavState = { index: 1, routes: [{ name: "onboarding" }, { name: "phone" }] };
    pressBack(mount());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("signed out with a signed-in screen behind it: the stack is cleared to C1", () => {
    mockNavState = { index: 1, routes: [{ name: "(tabs)" }, { name: "phone" }] };
    pressBack(mount());
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
  });
});
