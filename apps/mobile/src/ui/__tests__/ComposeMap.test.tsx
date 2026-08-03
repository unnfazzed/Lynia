/**
 * B-O2: `React.memo` boundary regression. ComposeMap mounts the single most expensive thing on the
 * customer compose screen — a native MapView — so re-rendering it for every unrelated keystroke
 * elsewhere in that form (item rows, note, declared value) is real waste on Go-class hardware. Pins
 * that it does NOT re-render across an unrelated parent re-render when its props are referentially
 * stable, and DOES re-render when a prop it actually reads (the active pin) changes.
 *
 * react-native-maps is a native module this test environment can't render (see
 * live-tracking-isolation.test.tsx's identical note for LiveMap) — mocked to trivial View stand-ins so
 * the REAL ComposeMap (not a probe) is under test.
 */
import React, { useState } from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { countMemoRenders } from "../../testing/render-count";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -17.83, longitude: 31.05 } }),
  getLastKnownPositionAsync: async () => null,
  reverseGeocodeAsync: async () => [],
  Accuracy: { Balanced: 3 },
}));

jest.mock("react-native-maps", () => {
  const React_ = require("react");
  const { View: View_ } = require("react-native");
  // Signals ready synchronously (via effect) so ComposeMap's own 6s "map didn't load" fallback timer
  // never survives past this test's act() flush — an orphaned real setTimeout still pending when the
  // test ends is exactly the kind of thing that crashes the whole worker later, not just fails a test.
  const MapView = React_.forwardRef(
    (props: { children?: React.ReactNode; onMapReady?: () => void }, ref: React.Ref<unknown>) => {
      React_.useImperativeHandle(ref, () => ({ animateToRegion: () => {}, fitToCoordinates: () => {} }));
      React_.useEffect(() => {
        props.onMapReady?.();
      }, []);
      return React_.createElement(View_, null, props.children);
    },
  );
  return {
    __esModule: true,
    default: MapView,
    Marker: (props: { children?: React.ReactNode }) => React_.createElement(View_, null, props.children),
    Polyline: () => null,
  };
});

import { ComposeMap } from "../ComposeMap";

const pickup = { lat: -17.83, lng: 31.05 };
const drop = { lat: -17.82, lng: 31.06 };
const noop = (): void => {};

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
});

describe("ComposeMap render isolation (B-O2)", () => {
  it("does not re-render when the parent re-renders but its own props are referentially unchanged", async () => {
    const { count } = countMemoRenders(ComposeMap);

    function Harness(): React.ReactElement {
      const [tick, setTick] = useState(0);
      return (
        <>
          <Text onPress={() => setTick((t) => t + 1)}>{tick}</Text>
          <ComposeMap pickup={pickup} drop={drop} active="pickup" onChangePickup={noop} onChangeDrop={noop} />
        </>
      );
    }
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    activeTree = tree;
    // Mount fires the mock MapView's own onMapReady effect, which flips ComposeMap's OWN mapReady
    // state — a genuine extra render of its own making, not something memo should (or does) prevent.
    // Asserted as a real positive count (not just used as a relative baseline below) so this test can't
    // silently no-op if ComposeMap were ever a plain, unmemoized function again — countMemoRenders'
    // `.type` patch only takes effect on an actual React.memo object; on a plain function it's a
    // harmless no-op property write that leaves `count()` pinned at 0 forever, which would make a
    // purely-relative assertion (`afterMount` vs. `afterMount`) trivially pass either way.
    const afterMount = count();
    expect(afterMount).toBeGreaterThanOrEqual(1);

    const trigger = tree.root.findByProps({ children: 0 });
    await act(async () => {
      (trigger.props as { onPress: () => void }).onPress();
    });
    expect(count()).toBe(afterMount);
  });

  it("re-renders when a prop it actually reads changes (active slot)", async () => {
    const { count } = countMemoRenders(ComposeMap);

    function Harness(): React.ReactElement {
      const [active, setActive] = useState<"pickup" | "drop">("pickup");
      return (
        <>
          <Text onPress={() => setActive("drop")}>{active}</Text>
          <ComposeMap pickup={pickup} drop={drop} active={active} onChangePickup={noop} onChangeDrop={noop} />
        </>
      );
    }
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    activeTree = tree;
    const afterMount = count();
    expect(afterMount).toBeGreaterThanOrEqual(1);

    const trigger = tree.root.findByProps({ children: "pickup" });
    await act(async () => {
      (trigger.props as { onPress: () => void }).onPress();
    });
    expect(count()).toBe(afterMount + 1);
  });
});
