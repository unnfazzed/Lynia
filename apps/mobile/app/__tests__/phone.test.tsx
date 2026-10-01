/**
 * C2 / C3 · Phone (Calm Mint v2, packages/design/handoff/calm-mint-v2-2026-10; ledger D-55): a fixed
 * +263 prefix, the nine national digits grouped as typed, the too-short line on "Send code", and the
 * E.164 number (plus any C1 rider intent) handed to the code screen.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
let mockParams: { intent?: string } = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
const mockRequestOtp = jest.fn(async () => ({ deliveryChannel: "whatsapp", devCode: null }));
jest.mock("../../src/api/auth", () => ({ requestOtp: (...a: unknown[]) => mockRequestOtp(...(a as [])) }));

import PhoneScreen from "../phone";

let live: renderer.ReactTestRenderer | null = null;
function mount(): renderer.ReactTestRenderer {
  act(() => {
    live = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <PhoneScreen />
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

afterEach(() => {
  if (live) act(() => live!.unmount());
  live = null;
  mockParams = {};
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
