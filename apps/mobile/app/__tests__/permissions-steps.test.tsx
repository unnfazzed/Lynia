/**
 * First-run permission priming — the two explainer steps, each its own gallery screen (LJ.perm_loc /
 * LJ.perm_notif, mocks screens.jsx `PermLoc` / `PermNotif`). Pins the drawn copy and the drawn GLYPH
 * of each step (the notifications step draws the phone glyph, not an inbox), and the `initialStep`
 * seam the parity lane mounts step 2 through.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-location", () => ({ requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock("../../src/auth/session", () => ({
  loadPermissionsPrimed: jest.fn(async () => false),
  savePermissionsPrimed: jest.fn(async () => undefined),
}));
jest.mock("../../src/push/push-kick", () => ({ requestPushRegistration: jest.fn() }));

import PermissionsScreen, { type PermissionsScreenProps } from "../permissions";
import { Icon } from "../../src/ui";

async function render(props: PermissionsScreenProps = {}): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<PermissionsScreen {...props} />);
  });
  return tree;
}

const text = (tree: renderer.ReactTestRenderer): string => JSON.stringify(tree.toJSON());
const iconNames = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Icon).map((n) => String(n.props.name));

describe("permission priming steps match their mocks", () => {
  it("step 1 (LJ.perm_loc): the location explainer, verbatim, with the navigation glyph", async () => {
    const tree = await render();
    const out = text(tree);
    expect(out).toContain("Turn on location");
    expect(out).toContain(
      "LyniaGo uses your location to set your pickup pin and match you with the closest riders. We only use it while you're arranging a delivery.",
    );
    expect(out).toContain("Allow location");
    expect(out).toContain("Enter address manually");
    expect(iconNames(tree)).toContain("navigation");
  });

  it("step 2 (LJ.perm_notif): the notifications explainer, verbatim, with the PHONE glyph", async () => {
    const tree = await render({ initialStep: "notifications" });
    const out = text(tree);
    expect(out).toContain("Stay in the loop");
    expect(out).toContain(
      "Get notified the moment a rider offers, when they're arriving, and when your parcel is delivered.",
    );
    expect(out).toContain("Turn on notifications");
    expect(out).toContain("Not now");
    const icons = iconNames(tree);
    expect(icons).toContain("phone");
    expect(icons).not.toContain("inbox");
  });
});
