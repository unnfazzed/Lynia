/**
 * Joint-launch copy on the first-install carousel (journey 0·2, design screens.jsx `ONBOARD`): with
 * `restaurantsEnabled` on, the three slides are Food ("Food from kitchens near you"), Send
 * ("Name your price to send"), then the shared promise ("One app, one code"); with the flag off, the
 * pre-joint-launch parcels-only slides render instead — the §1 escape hatch
 * (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md) must leave no pre-auth food mention
 * while the vertical is dark. Both sets are the same length, so a flags fetch resolving mid-carousel
 * can never strand the slide index.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

let mockFlags = { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false };
jest.mock("../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => mockFlags,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("../../src/auth/session", () => ({
  saveOnboardingSeen: jest.fn(async () => undefined),
}));

import OnboardingScreen from "../onboarding";

function renderOnboarding(): renderer.ReactTestRenderer {
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

/** Fire the onPress of the nearest pressable ancestor of the Text rendering `label`. */
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const matches = tree.root.findAll((n) => n.props?.children === label);
  let node = matches[matches.length - 1] ?? null;
  while (node && typeof node.props?.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`No pressable ancestor found for "${label}"`);
  const onPress = node.props.onPress as () => void;
  act(() => onPress());
}

describe("onboarding carousel slides follow restaurantsEnabled", () => {
  it("flag on: Food slide first, then Send, then the one-app promise", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: true };
    const tree = renderOnboarding();
    expect(rendered(tree)).toContain("Food from kitchens near you");
    press(tree, "Next");
    expect(rendered(tree)).toContain("Name your price to send");
    press(tree, "Next");
    const last = rendered(tree);
    expect(last).toContain("One app, one code");
    expect(last).toContain("More services soon.");
    expect(last).toContain("Get started");
  });

  it("flag off: the parcels-only slides render, with no food mention on any slide", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: false };
    const tree = renderOnboarding();
    const slides: string[] = [rendered(tree)];
    press(tree, "Next");
    slides.push(rendered(tree));
    press(tree, "Next");
    slides.push(rendered(tree));
    expect(slides[0]).toContain("Send a parcel");
    expect(slides[1]).toContain("Name your price");
    expect(slides[2]).toContain("Earn as a rider");
    for (const slide of slides) {
      expect(slide).not.toContain("kitchens");
      expect(slide).not.toContain("restaurants");
    }
  });
});
