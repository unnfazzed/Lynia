/**
 * Joint-launch copy on the post-OTP role fork (journey 0·5, design screens.jsx `role_select`): the
 * customer option must read "Use LyniaGo — Order food, send parcels, more services soon." only when
 * `restaurantsEnabled` is on, and keep the parcels-only wording verbatim when it is off. The §1
 * escape hatch (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md) darkens the whole food
 * vertical remotely, so an unflagged "order food" mention on this pre-auth screen would leak the
 * vertical while it is hidden — the same fail-safe-off contract the home Food tile honours via
 * getServiceTiles(). This screen was the last surface still carrying pre-joint-launch copy
 * unconditionally (it was never in any §5 lane queue), so these tests pin both flag positions.
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
  saveRolePreference: jest.fn(async () => undefined),
}));

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

  it("flag off: the parcels-only escape-hatch copy survives verbatim, with no food mention", () => {
    mockFlags = { ...mockFlags, restaurantsEnabled: false };
    const out = rendered(renderRole());
    expect(out).toContain("Send a parcel");
    expect(out).toContain("Post a delivery and let nearby riders bid.");
    expect(out).not.toContain("Use LyniaGo");
    expect(out).not.toContain("Order food");
  });
});
