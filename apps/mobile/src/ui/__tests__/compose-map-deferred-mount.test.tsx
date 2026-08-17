/**
 * PERF-SEND-01 — the native map is mounted one interaction LATE, and the "didn't load" clock starts
 * with the MAP rather than with the screen.
 *
 * Reported by the owner: tapping "Send" on the customer launcher "takes time to load". `/send` is a
 * pushed route, so its first commit runs inside React Navigation's push transition — and that commit
 * used to inflate a Google `MapView`, which initialises the Maps SDK on the UI thread. Every control
 * the composer actually needs (address rows, item/phone/price fields, the Broadcast CTA) lives in the
 * sheet ABOVE the map, so none of it had any reason to wait behind that mount, yet all of it did.
 *
 * Two things are pinned here, and the second is the one that makes the first safe:
 *   1. the first commit paints the composer WITHOUT the native map, which arrives after interactions;
 *   2. the 9s `MAP_LOAD_TIMEOUT_MS` budget is measured from the map's mount, not the screen's — so the
 *      deferral can never manufacture a false "The map didn't load" card by eating its own tile budget.
 *
 * react-native-maps is a native module this environment can't render (same note as ComposeMap.test),
 * so MapView is a stand-in that records each mount.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -17.83, longitude: 31.05 } }),
  reverseGeocodeAsync: async () => [],
  Accuracy: { Balanced: 3 },
}));

jest.mock("../../telemetry/sentry", () => ({ captureException: () => {}, addBreadcrumb: () => {} }));

type MapHandlers = { onMapReady?: () => void; onMapLoaded?: () => void };
const mounts: MapHandlers[] = [];

jest.mock("react-native-maps", () => {
  const React_ = require("react");
  const { View: View_ } = require("react-native");
  const MapView = React_.forwardRef((props: MapHandlers & { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
    React_.useImperativeHandle(ref, () => ({ animateToRegion: () => {}, fitToCoordinates: () => {} }));
    React_.useEffect(() => {
      mounts.push({ onMapReady: props.onMapReady, onMapLoaded: props.onMapLoaded });
    }, []);
    return React_.createElement(View_, null, props.children);
  });
  return { __esModule: true, default: MapView, Marker: () => null, Polyline: () => null };
});

import { ComposeMap } from "../ComposeMap";
import { controlInteractions, type InteractionControl } from "../../testing/interactions";

const noop = (): void => {};
const FAIL_TITLE = "The map didn't load";

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((n) => {
    const c = n.props.children;
    return typeof c === "string" ? [c] : [];
  });
}

function mount(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ComposeMap pickup={null} drop={null} active="pickup" onChangePickup={noop} onChangeDrop={noop} />);
  });
  return tree;
}

let interactions: InteractionControl;
/** Release the post-transition interaction the map's mount is queued behind. */
function flushInteractions(): void {
  act(() => interactions.flush());
}

beforeEach(() => {
  jest.useFakeTimers();
  interactions = controlInteractions();
  mounts.length = 0;
});
afterEach(() => {
  interactions.restore();
  jest.useRealTimers();
});

describe("ComposeMap — deferred native map mount (PERF-SEND-01)", () => {
  it("does not mount the native map in the screen's first commit", () => {
    const tree = mount();

    // The expensive native view is absent from the frame the push transition animates in...
    expect(mounts).toHaveLength(0);
    // ...while the composer's own chrome is already there and usable.
    expect(texts(tree)).toContain("Use my location");

    act(() => tree.unmount());
  });

  it("mounts the native map once interactions have settled", () => {
    const tree = mount();
    flushInteractions();

    expect(mounts).toHaveLength(1);

    act(() => tree.unmount());
  });

  it("starts the tile budget at the map's mount, not the screen's", () => {
    const tree = mount();

    // Sit on the pre-map frame for longer than the whole 9s budget. Nothing may be accused yet: no map
    // has been asked to draw anything.
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    // The interaction lands and the real map mounts — only now does its clock start.
    flushInteractions();
    expect(mounts).toHaveLength(1);
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    // ...and it still gets its full budget from that point.
    act(() => {
      jest.advanceTimersByTime(8_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(texts(tree)).toContain(FAIL_TITLE);

    act(() => tree.unmount());
  });

  it("cancels the pending mount when the screen is left before it lands", () => {
    const tree = mount();
    expect(interactions.pending()).toBe(1);

    act(() => tree.unmount());

    // The queued task is withdrawn, so nothing survives the screen to setState against it.
    expect(interactions.pending()).toBe(0);
    expect(() => flushInteractions()).not.toThrow();
    expect(mounts).toHaveLength(0);
  });
});
