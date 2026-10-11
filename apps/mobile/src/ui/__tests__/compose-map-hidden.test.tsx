/**
 * P36 review: Send keeps its step-1 map mounted but hidden (0×0) on steps 2–4. A pin change while hidden
 * (Edit → a new address, a re-broadcast prefill) must not frame the hidden map and burn the fit: the
 * fit waits until the map is shown again.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../testing/interactions";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -17.83, longitude: 31.05 } }),
  reverseGeocodeAsync: async () => [],
  Accuracy: { Balanced: 3 },
}));
jest.mock("../../telemetry/sentry", () => ({ captureException: () => {}, addBreadcrumb: () => {} }));

const mockFits: unknown[] = [];
jest.mock("react-native-maps", () => {
  const R = require("react");
  const { View } = require("react-native");
  const MapView = R.forwardRef((props: { children?: unknown }, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ fitToCoordinates: (c: unknown) => mockFits.push(c), animateToRegion: () => {} }));
    return R.createElement(View, null, props.children);
  });
  return { __esModule: true, default: MapView, Marker: () => null, Polyline: () => null };
});

import { ComposeMap } from "../ComposeMap";

const noop = (): void => {};
const A = { lat: -17.82, lng: 31.05, name: "A", source: "map" as const };
const B = { lat: -17.83, lng: 31.06, name: "B", source: "map" as const };
const C = { lat: -17.84, lng: 31.07, name: "C", source: "map" as const };

let interactions: InteractionControl;
beforeEach(() => {
  jest.useFakeTimers();
  interactions = controlInteractions();
  mockFits.length = 0;
});
afterEach(() => {
  interactions.restore();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it("doesn't frame a hidden map; frames the new pins once it is shown again", () => {
  const el = (drop: typeof B, hidden: boolean): React.ReactElement => (
    <ComposeMap pickup={A as never} drop={drop as never} active="drop" onChangePickup={noop} onChangeDrop={noop} hidden={hidden} />
  );
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el(B, false));
  });
  act(() => interactions.flush());
  expect(mockFits).toHaveLength(1);
  act(() => tree.update(el(C, true)));
  expect(mockFits).toHaveLength(1);
  act(() => tree.update(el(C, false)));
  expect(mockFits).toHaveLength(2);
  act(() => tree.unmount());
});
