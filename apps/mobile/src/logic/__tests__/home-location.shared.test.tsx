/**
 * P06 — one location detection per session, not one per screen.
 *
 * Nine screens mount `useHomeLocation`. Each used to run the whole chain on mount (keychain read,
 * permission read, a GPS fix, two reverse geocodes), the cached fix's geocode was unbounded and AWAITED
 * before the live fix started, and `point` was a new object every render. These pin the shared store:
 * one chain per TTL window, joined by concurrent mounts, painted on a later mount's first frame; the live
 * fix never waits on the cached geocode; geocodes are bounded; detect-only never adopts or writes a
 * manual pick; sign-out forgets the address.
 */
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { resetHomeLocationCache, useHomeLocation, type HomeLocationApi } from "../home-location";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const getPerm = Location.getForegroundPermissionsAsync as jest.Mock;
const lastKnown = Location.getLastKnownPositionAsync as jest.Mock;
const current = Location.getCurrentPositionAsync as jest.Mock;
const reverse = Location.reverseGeocodeAsync as jest.Mock;
const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;

const CACHED = { coords: { latitude: -17.8, longitude: 31.05 } };
const LIVE = { coords: { latitude: -17.83, longitude: 31.06 } };
const fixAddress = (lat: number) =>
  lat === LIVE.coords.latitude ? [{ street: "Lanark Rd", streetNumber: "12", district: "Belgravia" }] : [{ street: "Old Rd", streetNumber: "1" }];

const apis: Record<string, HomeLocationApi> = {};
function Harness({ id, detectOnly = false }: { id: string; detectOnly?: boolean }): null {
  apis[id] = useHomeLocation({ detectOnly });
  return null;
}

const trees: ReactTestRenderer[] = [];
async function mount(id: string, detectOnly = false): Promise<void> {
  await act(async () => {
    trees.push(create(<Harness id={id} detectOnly={detectOnly} />));
  });
}
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await act(async () => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetHomeLocationCache();
  getPerm.mockResolvedValue({ status: "granted", granted: true, canAskAgain: true });
  lastKnown.mockResolvedValue(CACHED);
  current.mockResolvedValue(LIVE);
  reverse.mockImplementation(async ({ latitude }: { latitude: number }) => fixAddress(latitude));
  getItem.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  for (const t of trees.splice(0)) act(() => t.unmount());
});

describe("useHomeLocation · one detection per session (P06)", () => {
  it("concurrent mounts join ONE chain: one fix, at most two geocodes, one keychain read", async () => {
    await mount("home");
    await mount("food");
    await mount("menu");
    await settle();

    expect(current).toHaveBeenCalledTimes(1);
    expect(reverse.mock.calls.length).toBeLessThanOrEqual(2);
    expect(getItem).toHaveBeenCalledTimes(1);
    for (const id of ["home", "food", "menu"]) {
      expect(apis[id]!.label).toBe("12 Lanark Rd");
      expect(apis[id]!.source).toBe("gps");
      expect(apis[id]!.locating).toBe(false);
    }
  });

  it("a screen pushed later paints the resolved place on its FIRST frame and detects nothing", async () => {
    await mount("home");
    await settle();
    jest.clearAllMocks();

    let firstFrame: HomeLocationApi | null = null;
    function FirstFrame(): null {
      const api = useHomeLocation();
      firstFrame ??= api;
      return null;
    }
    await act(async () => {
      trees.push(create(<FirstFrame />));
    });
    await settle();
    expect(firstFrame!.label).toBe("12 Lanark Rd");
    expect(firstFrame!.point).toEqual({ lat: LIVE.coords.latitude, lng: LIVE.coords.longitude });
    expect(firstFrame!.locating).toBe(false);
    expect(current).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("re-detects on a mount once the answer is older than two minutes", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await mount("home");
    await settle();
    expect(current).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 60_000);
    await mount("food");
    await settle();
    expect(current).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 121_000);
    await mount("menu");
    await settle();
    expect(current).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it("the live fix starts without waiting on the cached fix's geocode, and a late cached label never replaces it", async () => {
    let releaseCached!: (v: unknown) => void;
    reverse.mockImplementation(({ latitude }: { latitude: number }) =>
      latitude === CACHED.coords.latitude ? new Promise((r) => (releaseCached = r)) : Promise.resolve(fixAddress(latitude)),
    );
    await mount("home");
    await settle();

    // The cached geocode is still hanging, yet the live fix ran and its address painted.
    expect(current).toHaveBeenCalledTimes(1);
    expect(apis.home!.label).toBe("12 Lanark Rd");

    await act(async () => releaseCached([{ street: "Old Rd", streetNumber: "1" }]));
    await settle();
    expect(apis.home!.label).toBe("12 Lanark Rd");
  });

  it("a geocode that never answers is bounded: the row stops locating instead of hanging", async () => {
    jest.useFakeTimers();
    lastKnown.mockResolvedValue(null);
    reverse.mockImplementation(() => new Promise(() => undefined));
    await mount("home");
    await settle();
    expect(apis.home!.locating).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(9_001);
    });
    await settle();
    expect(apis.home!.locating).toBe(false);
    expect(apis.home!.source).toBe("none");
  });

  it("a manual pick on one screen is the deliver-to on every mounted screen, and stops detection", async () => {
    await mount("home");
    await mount("checkout");
    await settle();
    await act(async () => {
      apis.home!.setManualPlace({ label: "Gava's Kitchen", lat: -17.82, lng: 31.05, area: "Avondale" });
    });
    expect(apis.checkout!.label).toBe("Gava's Kitchen");
    expect(apis.checkout!.source).toBe("manual");

    jest.clearAllMocks();
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60_000);
    await mount("food");
    await settle();
    now.mockRestore();
    expect(current).not.toHaveBeenCalled();
    expect(apis.food!.label).toBe("Gava's Kitchen");
  });

  it("detect-only never adopts a stored manual pick and never writes the slot", async () => {
    getItem.mockResolvedValue(JSON.stringify({ label: "Customer's pick", lat: -17.7, lng: 31.0, manual: true }));
    await mount("rider", true);
    await settle();
    expect(current).toHaveBeenCalledTimes(1);
    expect(apis.rider!.label).toBe("12 Lanark Rd");
    expect(apis.rider!.source).toBe("gps");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("the customer face adopts a stored manual pick and skips the GPS entirely", async () => {
    getItem.mockResolvedValue(JSON.stringify({ label: "Customer's pick", lat: -17.7, lng: 31.0, manual: true }));
    await mount("home");
    await settle();
    expect(apis.home!.label).toBe("Customer's pick");
    expect(apis.home!.source).toBe("manual");
    expect(current).not.toHaveBeenCalled();
  });

  it("returns the same `point` object across re-renders, so consumers' memos hold", async () => {
    await mount("home");
    await settle();
    const first = apis.home!.point;
    await act(async () => {
      trees[0]!.update(<Harness id="home" />);
    });
    expect(apis.home!.point).toBe(first);
  });

  it("sign-out's reset forgets the address: the next mount starts from the prompt", async () => {
    await mount("home");
    await settle();
    expect(apis.home!.label).toBe("12 Lanark Rd");
    getPerm.mockResolvedValue({ status: "denied", granted: false, canAskAgain: true });
    await act(async () => {
      resetHomeLocationCache();
    });
    expect(apis.home!.source).toBe("none");
    await mount("next-user");
    await settle();
    expect(apis["next-user"]!.label).toBe("Set your location");
  });
});
