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
const mockBreadcrumb = jest.fn();
jest.mock("../../telemetry/sentry", () => ({
  captureException: (e: unknown, c?: unknown) => mockCapture(e, c),
  addBreadcrumb: (m: string, d?: unknown) => mockBreadcrumb(m, d),
}));

/**
 * The load signal is platform-derived (see `src/logic/map-load-signal.ts`), and the whole point of these
 * tests is that it differs per platform — so it is injected rather than inferred from the jest
 * environment. `mock`-prefixed so jest's module factory may close over it.
 */
let mockSignal: "onMapLoaded" | "onMapReady" = "onMapLoaded";
jest.mock("../../logic/map-load-signal", () => ({ mapLoadSignal: () => mockSignal }));

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

import { ComposeMap, mapElapsedBucket } from "../ComposeMap";
import { controlInteractions, type InteractionControl } from "../../testing/interactions";

const noop = (): void => {};
const FAIL_TITLE = "The map didn't load";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ComposeMap pickup={null} drop={null} active="pickup" onChangePickup={noop} onChangeDrop={noop} />);
  });
  // PERF-SEND-01: the native map is mounted one interaction AFTER the screen's first commit, so these
  // tests must let that interaction run before they can drive the map's own ready/loaded callbacks.
  // Only the interaction is released here — the map's own 9s clock is a plain timer these tests still
  // advance by hand, so every "before the timeout" assertion below means exactly what it says.
  act(() => interactions.flush());
  return tree;
}

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((n) => {
    const c = n.props.children;
    return typeof c === "string" ? [c] : [];
  });
}

let interactions: InteractionControl;
beforeEach(() => {
  jest.useFakeTimers();
  interactions = controlInteractions();
  mounts.length = 0;
  mockCapture.mockReset();
  mockBreadcrumb.mockReset();
  // Android unless a test says otherwise: every assertion in the first block below describes the
  // Google-Maps-SDK behaviour (`onMapReady` fires even after the key is rejected) that this file exists
  // to pin, and that behaviour only exists where `onMapLoaded` is the signal.
  mockSignal = "onMapLoaded";
});
afterEach(() => {
  interactions.restore();
  jest.useRealTimers();
});

describe("ComposeMap — map didn't load", () => {
  it("shows the failure card when the map is READY but never renders tiles", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
    });
    // Before any timeout: no accusation, the map may simply be slow.
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    // Stage 1 (9 s): the screen only ADMITS slowness — passive line, no card, no report (RCA §3.1).
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);
    expect(texts(tree).join(" ")).toMatch(/taking a while/i);
    expect(mockCapture).not.toHaveBeenCalled();

    // Stage 2 (22 s): the actionable card + the one report.
    act(() => {
      jest.advanceTimersByTime(13_000);
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
      jest.advanceTimersByTime(23_000);
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
      jest.advanceTimersByTime(23_000);
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
      jest.advanceTimersByTime(23_000);
    });
    const body = texts(tree).join(" ");
    expect(body).not.toMatch(/add details/i);
    expect(body).toMatch(/search the address above/i);

    act(() => tree.unmount());
  });
});

/**
 * The regression that made this file platform-aware, found from the Sentry issue
 * `compose-map-not-loaded (onMapReady=true)`.
 *
 * react-native-maps annotates `onMapLoaded` as **`@platform iOS: Google Maps only`** — it is bridged
 * from the Google Maps iOS SDK. This app passes no `provider` to any `MapView` and configures no
 * `ios.config.googleMapsApiKey`, so every iOS map is an Apple `MKMapView` and that event is never
 * emitted. Requiring it there did not weaken the check, it INVERTED it: the 9s timer expired on every
 * single session, so iOS customers got "The map didn't load" over a working map, lost the pin hint that
 * is gated on the same signal, and shipped a Sentry event each time — indistinguishable from the real
 * Android key rejection it was added to catch.
 */
describe("ComposeMap — a platform that never emits onMapLoaded (iOS / Apple Maps)", () => {
  beforeEach(() => {
    mockSignal = "onMapReady";
  });

  it("does not accuse a working map when onMapReady is the only event the platform emits", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
    });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);
    expect(mockCapture).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it("keeps the pin hint, the only cue that the map itself is the input", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
    });
    expect(texts(tree).join(" ")).toMatch(/tap the map to drop your pickup pin/i);

    act(() => tree.unmount());
  });

  it("still catches a map that never initialises at all", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(23_000);
    });
    expect(texts(tree)).toContain(FAIL_TITLE);
    expect(mockCapture).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
  });

  it("honours a real onMapLoaded if the app ever adopts PROVIDER_GOOGLE on iOS", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapLoaded?.();
    });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(texts(tree)).not.toContain(FAIL_TITLE);

    act(() => tree.unmount());
  });
});

/** What the report has to carry to be actionable — the Sentry issue it replaces carried none of it. */
describe("ComposeMap — the failure report", () => {
  function firstReport(): [Error, { tags?: Record<string, string> }] {
    const call = mockCapture.mock.calls[0];
    return [call?.[0] as Error, call?.[1] as { tags?: Record<string, string> }];
  }

  it("keeps the message constant and moves the varying parts into tags", () => {
    const tree = render();
    act(() => {
      mounts[0]?.onMapReady?.();
    });
    act(() => {
      jest.advanceTimersByTime(23_000);
    });

    const [error, context] = firstReport();
    // Sentry fingerprints on the message, so a value interpolated into it opens a separate issue per
    // value — which is exactly how one failure became `…(onMapReady=true)` and `…(onMapReady=false)`.
    expect(error.message).toBe("compose-map-not-loaded");
    expect(context.tags).toEqual(
      expect.objectContaining({
        map_load_signal: "onMapLoaded",
        map_ready: "true",
        map_attempt: "1",
        // Reachability (Lynia API, not Google's tile servers) + the bounded elapsed bucket — the
        // report fires at a fixed 22 s so its own bucket is ">=22s" by construction; the varying
        // buckets live on the compose-map-recovered breadcrumb.
        map_reachable: "true",
        map_elapsed_bucket: ">=22s",
      }),
    );
    // The signal tag is the one that separates a rejected Android Maps key from the iOS false positive.
    expect(context.tags?.map_platform).toBeTruthy();

    act(() => tree.unmount());
  });

  it("reports every failed retry, then stops at the cap", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(23_000);
    });
    expect(mockCapture).toHaveBeenCalledTimes(1);

    const pressRetry = (): void => {
      const btn = tree.root.findByProps({ accessibilityLabel: "Retry loading the map" });
      act(() => {
        (btn.props as { onPress: () => void }).onPress();
      });
      act(() => {
        jest.advanceTimersByTime(23_000);
      });
    };

    // A retry that also fails is its own event — the old flag was never cleared by `retryMap`, so
    // "I pressed Retry four times" looked identical to "it failed once".
    pressRetry();
    expect(mockCapture).toHaveBeenCalledTimes(2);
    expect(mockCapture.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ tags: expect.objectContaining({ map_attempt: "2" }) }),
    );

    // …but capped, because this app targets metered 2G/3G: a retry loop must not be an upload loop.
    pressRetry();
    pressRetry();
    pressRetry();
    expect(mockCapture).toHaveBeenCalledTimes(3);

    act(() => tree.unmount());
  });

  it("leaves a breadcrumb on every retry, capped or not, so a native crash can be tied to a remount", () => {
    // The cap above bounds EVENTS, not breadcrumbs: breadcrumbs cost nothing unless something is
    // reported, and the whole point is that the 4th retry — the one past the cap — is still on the
    // trail if the process dies right after it. This remount is the app's only `key`-driven native
    // view teardown, which is what makes it worth pinning to an unexplained native AssertionError.
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(23_000);
    });
    expect(mockBreadcrumb).not.toHaveBeenCalled();

    const btn = tree.root.findByProps({ accessibilityLabel: "Retry loading the map" });
    act(() => {
      (btn.props as { onPress: () => void }).onPress();
    });
    expect(mockBreadcrumb).toHaveBeenCalledWith("compose-map-retry", { attempt: 1 });

    act(() => tree.unmount());
  });
});

/**
 * The staged timeline (RCA 2026-08-17 §3.1): a 9 s passive admission, a 22 s actionable card. The
 * signature branching the RCA first proposed is NOT here on purpose — `mapReady && !mapLoaded` at 9 s
 * describes a slow 2G tile load and a rejected key identically (onMapReady is local SDK init), so any
 * early-card branch would have re-accused every slow session. What separates the two in the field is
 * the recovery breadcrumb: slow links recover, rejected keys never do.
 */
describe("ComposeMap — staged slow/failed timeline", () => {
  const SLOW_LINE = /taking a while/i;

  it("the passive line carries no alert role and no retry affordance", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(texts(tree).join(" ")).toMatch(SLOW_LINE);
    expect(tree.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: "Retry loading the map" })).toHaveLength(0);
    expect(mockCapture).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it("the passive line clears when tiles land, leaving a recovered breadcrumb with the elapsed bucket", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(12_000);
    });
    expect(texts(tree).join(" ")).toMatch(SLOW_LINE);

    act(() => {
      mounts[0]?.onMapLoaded?.();
    });
    expect(texts(tree).join(" ")).not.toMatch(SLOW_LINE);
    // Recovery is the datum the fixed-time failure report can't carry: slow links recover, rejected
    // keys don't. 12 s after the clock started → the [9 s, 15 s) bucket.
    expect(mockBreadcrumb).toHaveBeenCalledWith("compose-map-recovered", { elapsed_bucket: "9-15s", attempt: 1 });
    expect(mockCapture).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it("the passive line gives way to the failure card at the 22 s promote, not alongside it", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(23_000);
    });
    expect(texts(tree)).toContain(FAIL_TITLE);
    expect(texts(tree).join(" ")).not.toMatch(SLOW_LINE);

    act(() => tree.unmount());
  });
});

/** Bucket boundaries are half-open on the left edge of each range — pinned exactly so the tag's
 *  vocabulary can never drift or double-count a boundary value (review decision). */
describe("mapElapsedBucket boundaries", () => {
  it.each([
    [0, "<9s"],
    [8_999, "<9s"],
    [9_000, "9-15s"],
    [14_999, "9-15s"],
    [15_000, "15-22s"], // exactly 15 s belongs to the SECOND range
    [21_999, "15-22s"],
    [22_000, ">=22s"], // exactly 22 s belongs to the terminal range
    [60_000, ">=22s"],
  ])("%d ms → %s", (ms, bucket) => {
    expect(mapElapsedBucket(ms as number)).toBe(bucket);
  });
});
