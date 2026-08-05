/**
 * `addr_map_confirm` — the drag-to-adjust confirm step.
 *
 * The subtle rule worth pinning: a Places `placeId` describes the point Google resolved, so it must
 * NOT ride along once the customer has dragged the pin somewhere else. Keeping it would deep-link the
 * rider's turn-by-turn to the rooftop the customer just corrected away from — a wrong-door bug that is
 * invisible in the UI (the map shows the moved pin either way) and only bites on the rider's phone.
 *
 * Also pins the confirm gate: the landmark is contract-required (`Waypoint.landmark`, min 1), and
 * capturing it here is half the reason this step exists.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { AddressConfirmSheet } from "../AddressConfirmSheet";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// react-native-maps is a native module this environment can't render — trivial stand-ins keep the REAL
// sheet under test. `Marker` records the drag handler so a drag can be simulated.
let mockDragEnd: ((e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => void) | null = null;
jest.mock("react-native-maps", () => {
  const { View } = require("react-native");
  const React_ = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => React_.createElement(View, null, children),
    Marker: (p: { onDragEnd?: typeof mockDragEnd }) => {
      mockDragEnd = p.onDragEnd ?? null;
      return React_.createElement(View, null);
    },
  };
});

const PLACE = { lat: -17.83, lng: 31.05, landmark: "14 Glenara Avenue, Avenues, Harare", placeId: "place-abc" };

/** Buttons render their label as a plain child <Text> (src/ui/index.tsx Button) — walk up from that
 *  text node to the nearest pressable ancestor. Same helper shape as CashHandshakeCard.test.tsx. */
function press(tree: renderer.ReactTestRenderer, label: string): void {
  const text = tree.root.findAll((n) => n.props.children === label)[0];
  if (!text) throw new Error(`no button labelled "${label}"`);
  let node: typeof text | null = text;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`"${label}" has no pressable ancestor`);
  const press_ = node.props.onPress;
  act(() => press_());
}

describe("AddressConfirmSheet", () => {
  beforeEach(() => {
    mockDragEnd = null;
  });

  it("keeps the placeId when the customer confirms the resolved point untouched", () => {
    const onConfirm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressConfirmSheet place={PLACE} slot="drop" onConfirm={onConfirm} onCancel={jest.fn()} />);
    });

    press(tree, "Confirm drop-off");

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [point, landmark] = onConfirm.mock.calls[0];
    expect(point).toEqual({ lat: PLACE.lat, lng: PLACE.lng, placeId: "place-abc" });
    expect(landmark).toBe(PLACE.landmark);
    act(() => tree.unmount());
  });

  it("DROPS the placeId once the pin has been dragged — the coordinates are the customer's now", () => {
    const onConfirm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressConfirmSheet place={PLACE} slot="pickup" onConfirm={onConfirm} onCancel={jest.fn()} />);
    });

    act(() => {
      mockDragEnd?.({ nativeEvent: { coordinate: { latitude: -17.84, longitude: 31.06 } } });
    });
    press(tree, "Confirm pickup");

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [point] = onConfirm.mock.calls[0];
    expect(point).toEqual({ lat: -17.84, lng: 31.06 });
    expect(point).not.toHaveProperty("placeId");
    act(() => tree.unmount());
  });

  it("renders nothing when there is no place to confirm", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressConfirmSheet place={null} slot="pickup" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });

  it("shows the resolved address and the drag affordance", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressConfirmSheet place={PLACE} slot="drop" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    });
    const text = tree.root.findAllByType(Text).map((n) => JSON.stringify(n.props.children)).join(" ");
    expect(text).toContain("14 Glenara Avenue");
    expect(text).toContain("Drag the pin to adjust");
    act(() => tree.unmount());
  });
});
