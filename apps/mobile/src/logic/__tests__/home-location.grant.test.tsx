/**
 * A grant made AFTER a screen mounted must reach the shared location store.
 *
 * Field report (2026-10-15): a biker allowed location in the permission flow, landed on the board and the
 * header still read "Set your location". The board mounted under P1 with no permission, the store
 * answered "no grant", and nothing ever asked it again — it only detected on mount. These pin the three
 * ways back in: `refreshHomeLocation()` (the flow's grant, the board's re-read), a refresh queued behind a
 * chain already in flight, and the app returning to the foreground (a grant in the phone's settings, or a
 * fix that failed indoors). Plus the biker header's stale-fix fallback, which the customer face never uses.
 */
import * as Location from "expo-location";
import { AppState } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { refreshHomeLocation, resetHomeLocationCache, useHomeLocation, type HomeLocationApi } from "../home-location";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(async () => true),
  enableNetworkProviderAsync: jest.fn(),
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

const DENIED = { status: "undetermined", granted: false, canAskAgain: true };
const GRANTED = { status: "granted", granted: true, canAskAgain: true };
const LIVE = { coords: { latitude: -17.83, longitude: 31.06 } };

const appStateListeners: Array<(s: string) => void> = [];
jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => {
  appStateListeners.push(l);
  return { remove: () => appStateListeners.splice(appStateListeners.indexOf(l), 1) };
}) as never);

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
  for (let i = 0; i < 10; i++) await act(async () => undefined);
}
async function foreground(): Promise<void> {
  await act(async () => {
    for (const l of appStateListeners) l("active");
  });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetHomeLocationCache();
  getPerm.mockResolvedValue(DENIED);
  lastKnown.mockResolvedValue(null);
  current.mockResolvedValue(LIVE);
  reverse.mockResolvedValue([{ street: "Lanark Rd", streetNumber: "12", district: "Belgravia" }]);
});

afterEach(() => {
  for (const t of trees.splice(0)) act(() => t.unmount());
});

describe("home location · a grant after mount", () => {
  it("the biker board mounted before the grant picks up the address once the flow refreshes it", async () => {
    await mount("board", true);
    await settle();
    expect(apis.board!.source).toBe("none");
    expect(current).not.toHaveBeenCalled();

    getPerm.mockResolvedValue(GRANTED); // P1 → "While using the app"
    await act(async () => refreshHomeLocation());
    await settle();

    expect(apis.board!.label).toBe("12 Lanark Rd");
    expect(apis.board!.source).toBe("gps");
  });

  it("a refresh during a chain still in flight runs once more after it, so the grant is not lost", async () => {
    let release: (v: unknown) => void = () => undefined;
    getPerm.mockImplementationOnce(() => new Promise((r) => (release = r))); // the first read hangs on "no grant"
    await mount("board", true);

    getPerm.mockResolvedValue(GRANTED);
    await act(async () => refreshHomeLocation());
    await act(async () => release(DENIED));
    await settle();

    expect(apis.board!.label).toBe("12 Lanark Rd");
  });

  it("a grant made in the phone's settings lands when the app comes back to the foreground", async () => {
    await mount("home");
    await settle();
    expect(apis.home!.source).toBe("none");

    getPerm.mockResolvedValue(GRANTED);
    await foreground();

    expect(apis.home!.label).toBe("12 Lanark Rd");
  });

  it("a fix that failed indoors is retried on the next foreground", async () => {
    getPerm.mockResolvedValue(GRANTED);
    current.mockRejectedValueOnce(new Error("timeout"));
    await mount("home");
    await settle();
    expect(apis.home!.source).toBe("none");

    await foreground();
    expect(apis.home!.label).toBe("12 Lanark Rd");
  });

  it("a fresh answer is not re-detected on every foreground", async () => {
    getPerm.mockResolvedValue(GRANTED);
    await mount("home");
    await settle();
    expect(current).toHaveBeenCalledTimes(1);

    await foreground();
    expect(current).toHaveBeenCalledTimes(1);
  });

  it("the biker header falls back to an older fix when the live one fails; the customer face does not", async () => {
    getPerm.mockResolvedValue(GRANTED);
    current.mockRejectedValue(new Error("timeout"));
    // Only the stale read (30 min) has a fix; the 2-minute read has none.
    lastKnown.mockImplementation(async ({ maxAge }: { maxAge: number }) => (maxAge > 120_000 ? LIVE : null));

    await mount("board", true);
    await mount("home");
    await settle();

    expect(apis.board!.label).toBe("12 Lanark Rd");
    expect(apis.home!.source).toBe("none");
  });
});
