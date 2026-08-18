/**
 * AddressConfirmSheet — the confirm step's map is DEFERRED one interaction past the modal open
 * (RCA 2026-08-17 §4.2, deferred-item D4; the same PERF-SEND-01 deferral ComposeMap pins in
 * compose-map-deferred-mount.test.tsx). Contract: the parts the customer came for — the landmark
 * field and Confirm — are live from the sheet's first frame and never depend on the map existing;
 * the native map mounts only once the open animation has settled.
 */
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../testing/interactions";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

const mounts: unknown[] = [];
jest.mock("react-native-maps", () => {
  const React_ = require("react");
  const { View: View_ } = require("react-native");
  const MapView = React_.forwardRef((props: { children?: React.ReactNode }, _ref: unknown) => {
    React_.useEffect(() => {
      mounts.push(props);
    }, []);
    return React_.createElement(View_, null, props.children);
  });
  return { __esModule: true, default: MapView, Marker: () => null };
});

import { AddressConfirmSheet } from "../AddressConfirmSheet";

const PLACE = { lat: -17.8292, lng: 31.0522, landmark: "Joina City, Harare CBD", placeId: "p-1" };

let interactions: InteractionControl;
beforeEach(() => {
  interactions = controlInteractions();
  mounts.length = 0;
});
afterEach(() => {
  interactions.restore();
});

function render(onConfirm = jest.fn()): { tree: renderer.ReactTestRenderer; onConfirm: jest.Mock } {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <AddressConfirmSheet place={PLACE} slot="pickup" onConfirm={onConfirm} onCancel={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  return { tree, onConfirm };
}

const texts = (tree: renderer.ReactTestRenderer): string =>
  JSON.stringify(tree.root.findAllByType(Text).flatMap((n) => (typeof n.props.children === "string" ? [n.props.children] : [])));

describe("AddressConfirmSheet — deferred native map mount (D4)", () => {
  it("does not inflate the native map in the modal's opening commit", () => {
    const { tree } = render();
    expect(mounts).toHaveLength(0);
    // ...while the sheet's own content — the reason the customer is here — is already present.
    expect(texts(tree)).toContain("Confirm pickup");
    expect(texts(tree)).toContain("Joina City");
    act(() => tree.unmount());
  });

  it("mounts the map once the open animation settles", () => {
    const { tree } = render();
    act(() => interactions.flush());
    expect(mounts).toHaveLength(1);
    act(() => tree.unmount());
  });

  it("Confirm works BEFORE the map ever mounts — tiles were never a dependency", () => {
    const { tree, onConfirm } = render();
    const btn = tree.root.findByProps({ label: "Confirm pickup" });
    act(() => {
      (btn.props as { onPress: () => void }).onPress();
    });
    expect(onConfirm).toHaveBeenCalledWith(
      { lat: PLACE.lat, lng: PLACE.lng, placeId: "p-1" },
      "Joina City, Harare CBD",
    );
    expect(mounts).toHaveLength(0);
    act(() => tree.unmount());
  });
});
