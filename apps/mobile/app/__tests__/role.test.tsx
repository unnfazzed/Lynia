/**
 * Joint-launch copy on the post-OTP role fork. The screen is now codegen-adopted (Foundation-F.e): the
 * container picks a codegen view per `restaurantsEnabled` — the food-on `RoleSelectView` (mock
 * screens.jsx `RoleSelect`, customer option "Use LyniaGo — Order food, send parcels, more services
 * soon.") or the food-off `RoleSelectFlagOffView` (rev-2 mock screens-shipped.jsx `RoleSelectFlagOff`,
 * customer option "Use LyniaGo — Send parcels across Harare — more services soon."). Both copies are
 * verbatim from their mock (CLAUDE.md mock-copy-verbatim). The §1 escape hatch
 * (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md) darkens the whole food vertical
 * remotely, so an unflagged "order food" mention on this pre-auth screen would leak the vertical while
 * it is hidden — the same fail-safe-off contract the home Food tile honours via getServiceTiles(). The
 * rev-2 flag-off mock is already food-safe ("more services soon", no food word), so these tests pin
 * both flag positions AND the no-food-leak guarantee.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

let mockFlags = { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false };
jest.mock("../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => mockFlags,
}));
const mockRedirects: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  Redirect: ({ href }: { href: string }) => {
    mockRedirects.push(href);
    return null;
  },
}));
jest.mock("../../src/auth/session", () => ({
  saveRolePreference: jest.fn(async () => undefined),
}));

import { riderModeAvailable } from "../../src/rider-mode";
import { stylesDirectlyInSafeArea } from "../../src/testing/safe-area-fill";
import RoleScreen from "../role";

function renderRole(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <RoleScreen />
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const rendered = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());

describe("role screen copy follows restaurantsEnabled", () => {
  it("flag on: customer option is the joint-launch 'Use LyniaGo' (order food, send parcels)", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: true };
    const out = rendered(renderRole());
    expect(out).toContain("Use LyniaGo");
    expect(out).toContain("Order food, send parcels, more services soon.");
    expect(out).not.toContain("Post a delivery and let nearby riders bid.");
    // The rider option and the design's CTA wording are flag-independent.
    expect(out).toContain("Earn as a rider");
    expect(out).toContain("Continue as a customer");
  });

  it("flag off: the rev-2 mock's food-safe copy renders verbatim, with no food mention", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: false };
    const out = rendered(renderRole());
    // RoleSelectFlagOffView (screens-shipped.jsx RoleSelectFlagOff) — parcels-only, food-safe wording.
    expect(out).toContain("Send parcels across Harare — more services soon.");
    // The food-off view must NOT leak the darkened vertical (no "order food" in any casing).
    expect(out).not.toContain("Order food");
    expect(out).not.toContain("order food");
    // The rider option and the design's CTA wording are flag-independent.
    expect(out).toContain("Earn as a rider");
    expect(out).toContain("Continue as a customer");
  });
});

// SDK54-09: both views are minHeight:100%, which overflows the phone by the insets when placed
// straight inside the SafeAreaView (see onboarding.tsx).
describe("the role picker fits between the safe-area insets", () => {
  it.each([true, false])("restaurantsEnabled=%s: an unpadded flex:1 View sits between them", (restaurantsEnabled) => {
    mockFlags = { ...mockFlags, restaurantsEnabled };
    expect(stylesDirectlyInSafeArea(renderRole())).toEqual([{ flex: 1 }]);
  });
});

// D-41: the iPhone app ships customer-only, so there is no fork to show there. Sign-in never routes
// here on iOS (signedInDestination); a stale deep link continues exactly as "customer" would.
describe("role screen on the customer-only iPhone app (D-41)", () => {
  it("draws no fork and continues to the customer's permission priming", () => {
    jest.mocked(riderModeAvailable).mockReturnValue(false);
    mockRedirects.length = 0;
    const out = rendered(renderRole());
    expect(out).not.toContain("Earn as a rider");
    expect(out).not.toContain("Continue as a customer");
    expect(mockRedirects).toEqual(["/permissions?next=/home"]);
  });
});
