/**
 * C1 · Welcome (Calm Mint v2, packages/design/handoff/calm-mint-v2-2026-10; ledger D-55): the first
 * screen of a new install, replacing the intro carousel. "Continue with your number" goes to the phone
 * screen; "Want to earn? Ride with LyniaGo" goes there with a rider intent — and is not drawn at all on
 * the customer-only iPhone app (D-41). Both mark onboarding seen.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
const mockSaveSeen = jest.fn(async () => undefined);
jest.mock("../../src/auth/session", () => ({
  saveOnboardingSeen: () => mockSaveSeen(),
}));
jest.mock("../../src/rider-mode", () => ({ riderModeAvailable: jest.fn(() => true) }));

import { riderModeAvailable } from "../../src/rider-mode";
import OnboardingScreen from "../onboarding";

function renderWelcome(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <OnboardingScreen />
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const rendered = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());

function pressLabel(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === "function");
  act(() => (node.props.onPress as () => void)());
}

afterEach(() => {
  jest.clearAllMocks();
  jest.mocked(riderModeAvailable).mockReturnValue(true);
});

describe("C1 · Welcome", () => {
  it("draws the handoff's copy verbatim", () => {
    const out = rendered(renderWelcome());
    for (const s of ["Parcels and food", "across town.", "Cash or mobile money", "A code at the door, every delivery", "Live tracking to your gate", "Continue with your number", "Ride with LyniaGo"]) {
      expect(out).toContain(s);
    }
    // The carousel is gone.
    expect(out).not.toContain("Skip");
    expect(out).not.toContain("Get started");
  });

  it("'Continue with your number' marks onboarding seen and opens the phone screen", () => {
    const tree = renderWelcome();
    pressLabel(tree, "Continue with your number");
    expect(mockSaveSeen).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/phone");
  });

  it("'Ride with LyniaGo' carries a rider intent into sign-in", () => {
    const tree = renderWelcome();
    pressLabel(tree, "Want to earn? Ride with LyniaGo");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/phone", params: { intent: "rider" } });
  });

  it("draws no rider link on the customer-only iPhone app (D-41)", () => {
    jest.mocked(riderModeAvailable).mockReturnValue(false);
    expect(rendered(renderWelcome())).not.toContain("Ride with LyniaGo");
  });
});
