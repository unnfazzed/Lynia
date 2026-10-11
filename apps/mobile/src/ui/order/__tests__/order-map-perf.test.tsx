/**
 * Customer review 2026-10-07 — the order maps' native-side costs (`map-perf.tsx`), nothing drawn differently:
 *  - P12: the native MapView mounts one interaction after the push (the map's ground colour until then), and
 *    the opening state is the same map with no stops — one native map per open, not BlankMap + OrderMap.
 *  - P20: the finding rings are a plain view over the map, not a `tracksViewChanges` marker re-rasterised
 *    ~25×/s.
 *  - P37: on Android a new rider fix glides through the native marker animation (`animateMarkerToCoordinate`),
 *    not ~48 JS frames of an AnimatedRegion timing.
 *
 * react-native-maps can't render here: MapView / Marker are stand-ins that record what they were given.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../../testing/interactions";

type Rec = Record<string, unknown>;
const mockMapMounts: Rec[] = [];
const mockMarkers: Rec[] = [];
const mockAnimated: Array<{ c: unknown; ms: number }> = [];
const mockTimings: unknown[] = [];

jest.mock("react-native-maps", () => {
  const R = require("react");
  const { View } = require("react-native");
  const MapView = R.forwardRef((props: Rec & { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
    R.useImperativeHandle(ref, () => ({
      fitToCoordinates: () => {},
      pointForCoordinate: async () => ({ x: 100, y: 120 }),
    }));
    R.useEffect(() => {
      mockMapMounts.push(props);
    }, []);
    return R.createElement(View, { testID: "native-map" }, props.children);
  });
  const Marker = R.forwardRef((props: Rec & { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
    R.useImperativeHandle(ref, () => ({ animateMarkerToCoordinate: (c: unknown, ms: number) => mockAnimated.push({ c, ms }) }));
    mockMarkers.push(props);
    return R.createElement(View, null, props.children);
  });
  function AnimatedRegion(this: { v: unknown }, v: unknown): void {
    this.v = v;
  }
  AnimatedRegion.prototype.setValue = function (this: { v: unknown }, v: unknown): void {
    this.v = v;
  };
  AnimatedRegion.prototype.timing = function (v: unknown): { start: () => void } {
    mockTimings.push(v);
    return { start: () => undefined };
  };
  return { __esModule: true, default: MapView, Marker, MarkerAnimated: Marker, Polyline: () => null, AnimatedRegion };
});

const PICKUP = { lat: -17.82, lng: 31.05 };
const DROP = { lat: -17.83, lng: 31.06 };
const base = {
  riderLabel: "Tendai",
  riderPaused: false,
  showRider: true,
  toPickupLine: false,
  rings: false,
  dim: false,
  frame: "route" as const,
  padBottom: 200,
  reduceMotion: false,
};

let interactions: InteractionControl;
beforeEach(() => {
  interactions = controlInteractions();
  mockMapMounts.length = 0;
  mockMarkers.length = 0;
  mockAnimated.length = 0;
  mockTimings.length = 0;
});
afterEach(() => interactions.restore());

describe("OrderMap (iOS / default platform)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OrderMap } = require("../OrderMap") as typeof import("../OrderMap");

  it("P12: no native map in the push's commit; one map after interactions, kept when the order arrives", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<OrderMap {...base} pickup={null} dropoff={null} rider={null} />);
    });
    expect(mockMapMounts).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.testID === "map-ground").length).toBeGreaterThan(0);
    act(() => interactions.flush());
    expect(mockMapMounts).toHaveLength(1);
    // The order lands: the same native map gets its pins — no second MapView.
    act(() => tree.update(<OrderMap {...base} pickup={PICKUP} dropoff={DROP} rider={null} />));
    expect(mockMapMounts).toHaveLength(1);
    expect(tree.root.findAll((n) => n.props.testID === "map-ground")).toHaveLength(0);
    act(() => tree.unmount());
  });

  it("P20: the finding rings are a plain overlay view — no marker tracking view changes", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<OrderMap {...base} showRider={false} rings pickup={PICKUP} dropoff={DROP} rider={null} />);
    });
    act(() => interactions.flush());
    await act(async () => undefined);
    expect(mockMarkers.some((m) => m.tracksViewChanges === true)).toBe(false);
    const overlay = tree.root.findAll((n) => n.props.testID === "finding-rings");
    expect(overlay.length).toBeGreaterThan(0);
    expect(overlay[0]!.props.pointerEvents).toBe("none");
    act(() => tree.unmount());
  });

  it("P37 (non-Android): the AnimatedRegion glide is kept", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<OrderMap {...base} pickup={PICKUP} dropoff={DROP} rider={{ lat: -17.825, lng: 31.055 }} />);
    });
    act(() => interactions.flush());
    act(() => tree.update(<OrderMap {...base} pickup={PICKUP} dropoff={DROP} rider={{ lat: -17.826, lng: 31.056 }} />));
    expect(mockTimings).toHaveLength(1);
    expect(mockAnimated).toHaveLength(0);
    act(() => tree.unmount());
  });
});

describe("GlidingMarker on Android (P37)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GlidingMarker } = require("../map-perf") as typeof import("../map-perf");
  const { Platform } = require("react-native") as typeof import("react-native");
  let was: typeof Platform.OS;
  beforeEach(() => {
    was = Platform.OS;
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = was;
  });

  it("glides through the native marker animation, with no JS-driven timing", () => {
    const el = (lat: number, reduceMotion = false): React.ReactElement => (
      <GlidingMarker point={{ lat, lng: 31.055 }} markerKey="rider" anchor={{ x: 0.5, y: 0.3 }} reduceMotion={reduceMotion}>
        {null}
      </GlidingMarker>
    );
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(el(-17.825));
    });
    const mountedAt = mockMarkers[mockMarkers.length - 1]!.coordinate;
    expect(mountedAt).toEqual({ latitude: -17.825, longitude: 31.055 });
    act(() => tree.update(el(-17.826)));
    expect(mockAnimated).toEqual([{ c: { latitude: -17.826, longitude: 31.055 }, ms: 800 }]);
    expect(mockTimings).toHaveLength(0);
    // The native animation owns the position: the marker's coordinate prop doesn't jump.
    expect(mockMarkers[mockMarkers.length - 1]!.coordinate).toBe(mountedAt);
    // Reduce motion: a snap (the coordinate prop moves), no animation.
    act(() => tree.update(el(-17.827, true)));
    expect(mockAnimated).toHaveLength(1);
    expect(mockMarkers[mockMarkers.length - 1]!.coordinate).toEqual({ latitude: -17.827, longitude: 31.055 });
    act(() => tree.unmount());
  });
});
