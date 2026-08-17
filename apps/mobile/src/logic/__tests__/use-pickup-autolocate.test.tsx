/**
 * `usePickupAutolocate` — the send composer's open-the-tab pickup prefill (owner instruction
 * 2026-08-17: "on pickup, it must automatically prefill the pickup location with your current
 * location. You can edit but it must be prefilled when you open the tab").
 *
 * The properties worth locking down are the ones that separate this from the explicit "Use my
 * location" button it sits beside: it asks for permission only when the OS would actually show the
 * dialog, it paints the cached fix before the live one so the pin is there on open rather than
 * seconds later, it geocodes the FINAL point only, and every failure path is silent.
 */
import * as Location from "expo-location";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PickedPoint } from "../../ui/MapPicker";
import { usePickupAutolocate } from "../use-pickup-autolocate";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const getPerm = Location.getForegroundPermissionsAsync as jest.Mock;
const askPerm = Location.requestForegroundPermissionsAsync as jest.Mock;
const lastKnown = Location.getLastKnownPositionAsync as jest.Mock;
const current = Location.getCurrentPositionAsync as jest.Mock;
const reverse = Location.reverseGeocodeAsync as jest.Mock;

const CACHED = { coords: { latitude: -17.83, longitude: 31.05 } };
const LIVE = { coords: { latitude: -17.8305, longitude: 31.0512 } };

function Harness(props: {
  enabled?: boolean;
  onPoint: (p: PickedPoint) => void;
  onLandmark: (l: string) => void;
}): null {
  usePickupAutolocate({ enabled: props.enabled ?? true, onPoint: props.onPoint, onLandmark: props.onLandmark });
  return null;
}

let tree: ReactTestRenderer | null = null;

/** Mount the hook and let every awaited step in its async chain settle. */
async function run(props: Parameters<typeof Harness>[0]): Promise<void> {
  await act(async () => {
    tree = create(<Harness {...props} />);
  });
  // The chain is permission → cached → live → reverse-geocode; each `await` is one microtask turn,
  // and a couple of extra flushes cost nothing and keep this robust to an added step.
  for (let i = 0; i < 6; i++) await act(async () => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  getPerm.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
  lastKnown.mockResolvedValue(null);
  current.mockResolvedValue(LIVE);
  reverse.mockResolvedValue([]);
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe("usePickupAutolocate", () => {
  it("prefills the pickup point from the device's position without being asked", async () => {
    const onPoint = jest.fn();
    await run({ onPoint, onLandmark: jest.fn() });

    expect(onPoint).toHaveBeenCalledWith({ lat: LIVE.coords.latitude, lng: LIVE.coords.longitude });
  });

  it("paints the cached fix first, then refines it with the live one", async () => {
    lastKnown.mockResolvedValue(CACHED);
    const onPoint = jest.fn();
    await run({ onPoint, onLandmark: jest.fn() });

    // Order matters: the cached fix is what makes the pin feel prefilled ON OPEN — a cold GPS lock on
    // a Go-class handset is seconds, and "eventually filled" is not what was asked for.
    expect(onPoint.mock.calls.map(([p]) => p)).toEqual([
      { lat: CACHED.coords.latitude, lng: CACHED.coords.longitude },
      { lat: LIVE.coords.latitude, lng: LIVE.coords.longitude },
    ]);
  });

  it("names the cached fix immediately, then the live fix's own geocode replaces it (RCA §4.1)", async () => {
    lastKnown.mockResolvedValue(CACHED);
    reverse.mockImplementation(async ({ latitude }: { latitude: number }) =>
      latitude === CACHED.coords.latitude
        ? [{ name: "Cached Corner", street: "Old St", district: "Harare CBD" }]
        : [{ name: "Joina City", street: "Jason Moyo Ave", district: "Harare CBD" }],
    );
    const onLandmark = jest.fn();
    await run({ onPoint: jest.fn(), onLandmark });

    // BOTH points geocode — the address follows the pin's cached-then-refined rule, and there is no
    // distance threshold: a differing live point always gets its own lookup (a near neighbour can be
    // a different address across a road).
    expect(reverse).toHaveBeenCalledWith({ latitude: CACHED.coords.latitude, longitude: CACHED.coords.longitude });
    expect(reverse).toHaveBeenCalledWith({ latitude: LIVE.coords.latitude, longitude: LIVE.coords.longitude });
    expect(onLandmark.mock.calls.map(([l]) => l)).toEqual([
      "Cached Corner, Old St, Harare CBD",
      "Joina City, Jason Moyo Ave, Harare CBD",
    ]);
  });

  it("the cached-fix geocode starts WITHOUT waiting for the live fix (concurrent, not sequential)", async () => {
    lastKnown.mockResolvedValue(CACHED);
    // The live fix never settles — the cached name must still land (a sequential chain would wait).
    current.mockReturnValue(new Promise(() => {}));
    reverse.mockResolvedValue([{ name: "Cached Corner", street: null, district: "Harare CBD" }]);
    const onLandmark = jest.fn();
    await run({ onPoint: jest.fn(), onLandmark });

    expect(onLandmark).toHaveBeenCalledWith("Cached Corner, Harare CBD");
  });

  it("a slow cached geocode can never overwrite the live fix's landmark (generation guard)", async () => {
    lastKnown.mockResolvedValue(CACHED);
    let releaseCached: (v: unknown) => void = () => {};
    reverse.mockImplementation(({ latitude }: { latitude: number }) =>
      latitude === CACHED.coords.latitude
        ? new Promise((resolve) => (releaseCached = resolve)) // cached lookup stalls…
        : Promise.resolve([{ name: "Joina City", street: null, district: "Harare CBD" }]),
    );
    const onLandmark = jest.fn();
    await run({ onPoint: jest.fn(), onLandmark });

    expect(onLandmark.mock.calls.map(([l]) => l)).toEqual(["Joina City, Harare CBD"]);
    // …and resolves only AFTER the live landmark landed: it must be discarded, not applied.
    await act(async () => {
      releaseCached([{ name: "Cached Corner", street: null, district: "Harare CBD" }]);
    });
    await act(async () => undefined);
    expect(onLandmark.mock.calls.map(([l]) => l)).toEqual(["Joina City, Harare CBD"]);
  });

  it("identical cached and live coordinates pay for exactly one geocoder lookup", async () => {
    lastKnown.mockResolvedValue(CACHED);
    current.mockResolvedValue(CACHED);
    reverse.mockResolvedValue([{ name: "Joina City", street: null, district: "Harare CBD" }]);
    const onLandmark = jest.fn();
    await run({ onPoint: jest.fn(), onLandmark });

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(onLandmark).toHaveBeenCalledTimes(1);
    expect(onLandmark).toHaveBeenCalledWith("Joina City, Harare CBD");
  });

  it("falls back to the cached point for the landmark when the live fix never arrives", async () => {
    lastKnown.mockResolvedValue(CACHED);
    current.mockRejectedValue(new Error("location-timeout"));
    reverse.mockResolvedValue([{ name: "Joina City", street: null, district: "Harare CBD" }]);
    const onPoint = jest.fn();
    const onLandmark = jest.fn();
    await run({ onPoint, onLandmark });

    expect(onPoint).toHaveBeenCalledTimes(1);
    expect(onPoint).toHaveBeenCalledWith({ lat: CACHED.coords.latitude, lng: CACHED.coords.longitude });
    expect(onLandmark).toHaveBeenCalledWith("Joina City, Harare CBD");
  });

  it("does nothing at all when disabled (a re-broadcast owns the pickup pin)", async () => {
    const onPoint = jest.fn();
    await run({ enabled: false, onPoint, onLandmark: jest.fn() });

    expect(getPerm).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(onPoint).not.toHaveBeenCalled();
  });

  it("requests permission when it can, and locates once granted", async () => {
    getPerm.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    askPerm.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    const onPoint = jest.fn();
    await run({ onPoint, onLandmark: jest.fn() });

    expect(askPerm).toHaveBeenCalledTimes(1);
    expect(onPoint).toHaveBeenCalledWith({ lat: LIVE.coords.latitude, lng: LIVE.coords.longitude });
  });

  it("never prompts when the OS would refuse to show the dialog", async () => {
    getPerm.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    const onPoint = jest.fn();
    await run({ onPoint, onLandmark: jest.fn() });

    expect(askPerm).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(onPoint).not.toHaveBeenCalled();
  });

  it("stays silent when permission is refused at the prompt", async () => {
    getPerm.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    askPerm.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
    const onPoint = jest.fn();
    const onLandmark = jest.fn();
    await run({ onPoint, onLandmark });

    expect(onPoint).not.toHaveBeenCalled();
    expect(onLandmark).not.toHaveBeenCalled();
  });

  it("stays silent when there is no fix to be had at all", async () => {
    lastKnown.mockResolvedValue(null);
    current.mockRejectedValue(new Error("location-timeout"));
    const onPoint = jest.fn();
    const onLandmark = jest.fn();
    await run({ onPoint, onLandmark });

    expect(onPoint).not.toHaveBeenCalled();
    expect(onLandmark).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });

  it("reports no landmark when the geocoder fails, but still leaves the pin placed", async () => {
    reverse.mockRejectedValue(new Error("offline"));
    const onPoint = jest.fn();
    const onLandmark = jest.fn();
    await run({ onPoint, onLandmark });

    expect(onPoint).toHaveBeenCalledWith({ lat: LIVE.coords.latitude, lng: LIVE.coords.longitude });
    expect(onLandmark).not.toHaveBeenCalled();
  });

  it("locates exactly once per mount, however often the caller re-renders", async () => {
    const onPoint = jest.fn();
    const onLandmark = jest.fn();
    await act(async () => {
      tree = create(<Harness onPoint={onPoint} onLandmark={onLandmark} />);
    });
    for (let i = 0; i < 4; i++) {
      // Fresh callback identities every time — the caller's handlers must not be an effect input, or a
      // late fix could re-drive a pin the customer has since moved.
      await act(async () => {
        tree!.update(<Harness onPoint={onPoint} onLandmark={onLandmark} />);
      });
    }
    for (let i = 0; i < 6; i++) await act(async () => undefined);

    expect(getPerm).toHaveBeenCalledTimes(1);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it("drops a fix that resolves after the screen is gone", async () => {
    let release: (v: typeof LIVE) => void = () => {};
    current.mockReturnValue(new Promise<typeof LIVE>((resolve) => (release = resolve)));
    const onPoint = jest.fn();
    await act(async () => {
      tree = create(<Harness onPoint={onPoint} onLandmark={jest.fn()} />);
    });
    await act(async () => undefined);
    await act(async () => {
      tree!.unmount();
    });
    tree = null;
    await act(async () => {
      release(LIVE);
    });
    await act(async () => undefined);

    expect(onPoint).not.toHaveBeenCalled();
  });
});
