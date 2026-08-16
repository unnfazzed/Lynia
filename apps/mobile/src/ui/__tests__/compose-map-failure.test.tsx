/**
 * The compose map's "didn't load" state. This is the screen the customer reported as a dead end: the
 * map never drew, and with no way to place a pin the send flow could not be completed at all.
 *
 * The regression pinned here is the DETECTION SIGNAL. The fallback originally keyed on `onMapReady`,
 * which the Android Maps SDK fires as soon as it has a `GoogleMap` object — including when it has just
 * rejected the API key and will never draw a tile. So on the exact failure being reported, the card
 * stayed hidden and the screen showed a blank canvas under a "tap the map" hint that did nothing.
 * `onMapLoaded` ("finished rendering all tiles") is the signal that actually distinguishes the two.
 *
 * react-native-maps is a native module this environment can't render (same note as ComposeMap.test),
 * so MapView is a stand-in whose ready/loaded callbacks the test drives explicitly.
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

const mockCapture = jest.fn();
jest.mock("../../telemetry/sentry", () => ({ captureException: (e: unknown) => mockCapture(e) }));

/** Per-mount callbacks the test fires by hand, so "ready but never loaded" is expressible. */
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
  return {
    __esModule: true,
    default: MapView,
    Marker: () => null,
    Polyline: () => null,
  };
});

import { ComposeMap } from "../ComposeMap";

const noop = (): void => {};
const FAIL_TITLE = "The map didn't load";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ComposeMap pickup={null} drop={null} active="pickup" onChangePickup={noop} onChangeDrop={noop} />);
  });
  return tree;
}

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((n) => {
    const c = n.props.children;
    return typeof c === "string" ? [c] : [];
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mounts.length = 0;
  mockCapture.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("ComposeMap — map didn't load", () => {
  it("shows the failure card when the map is READY but never renders tiles", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
    });
    // Before the timeout: no accusation, the map may simply be slow.
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(texts(tree)).toContain(FAIL_TITLE);
    // And it is reported once, so a blank map is a diagnosable event rather than a user's description.
    expect(mockCapture).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
  });

  it("stays silent when tiles do render, however slowly", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
      mounts[0]?.onMapLoaded?.();
    });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);
    expect(mockCapture).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it("clears itself if late tiles arrive after the card is already up", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(texts(tree)).toContain(FAIL_TITLE);

    act(() => {
      mounts[0]?.onMapLoaded?.();
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    act(() => tree.unmount());
  });

  it('"Retry the map" remounts the native map and restarts the clock', () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mounts).toHaveLength(1);

    const retry = tree.root.findByProps({ accessibilityLabel: "Retry loading the map" });
    act(() => {
      (retry.props as { onPress: () => void }).onPress();
    });
    // A fresh native map, and the card is gone while the retry gets its own chance.
    expect(mounts).toHaveLength(2);
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    act(() => {
      mounts[1]?.onMapLoaded?.();
      jest.advanceTimersByTime(30_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    act(() => tree.unmount());
  });

  it("offers no advice that cannot produce a coordinate", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    const body = texts(tree).join(" ");
    expect(body).not.toMatch(/add details/i);
    expect(body).toMatch(/search the address above/i);

    act(() => tree.unmount());
  });
});
