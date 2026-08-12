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

  // The flag-off set is drawn by its own mock (screens-shipped.jsx `OnboardFlagOff`, LJ.onboard_flag_off):
  // TWO dots, opening on the banknote "Name your price to send" slide with its copy verbatim.
  it("flag off: the mock's two parcels-only slides render, with no food mention on either", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: false };
    const tree = renderOnboarding();
    const slides: string[] = [rendered(tree)];
    expect(slides[0]).toContain("Name your price to send");
    expect(slides[0]).toContain("Say what you'll pay to send a parcel. Riders bid for it — no fixed tariff, no haggling in the street.");
    // Two slides ⇒ the first is not the last, so it still reads "Next".
    expect(slides[0]).toContain("Next");
    press(tree, "Next");
    slides.push(rendered(tree));
    expect(slides[1]).toContain("Earn as a rider");
    expect(slides[1]).toContain("Get started");
    for (const slide of slides) {
      expect(slide).not.toContain("kitchens");
      expect(slide).not.toContain("restaurants");
    }
  });

  // Each slide is its own gallery screen; the parity lane mounts one directly through `initialSlide`.
  it("initialSlide opens the carousel on that slide (LJ.onboard_send / LJ.onboard_shared)", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: true };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <OnboardingScreen initialSlide={1} />
        </SafeAreaProvider>,
      );
    });
    expect(rendered(tree)).toContain("Name your price to send");
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <OnboardingScreen initialSlide={2} />
        </SafeAreaProvider>,
      );
    });
    const last = rendered(tree);
    expect(last).toContain("One app, one code");
    expect(last).toContain("Get started");
  });

  // A flags fetch resolving mid-carousel shrinks the set from 3 to 2: the index must clamp into it
  // rather than stranding past the end.
  it("clamps a stranded index when the slide set shrinks under it", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: false };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <OnboardingScreen initialSlide={2} />
        </SafeAreaProvider>,
      );
    });
    const out = rendered(tree);
    expect(out).toContain("Earn as a rider");
    expect(out).toContain("Get started");
  });
});
