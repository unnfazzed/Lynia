/**
 * `useHomeLocation` — the manual-pick path (`setManualPlace`).
 *
 * REGRESSION: the location sheet hands back a `ResolvedPlace` (lat/lng/landmark/placeId), which has
 * NO suburb — neither a saved Home/Work slot nor an address search can supply one. So every pick
 * blanked `area`, and the food list's area-qualified deliver-to silently degraded to a bare street
 * plus "N places deliver here" the moment a customer changed location. The hook now resolves the
 * suburb from the picked COORDINATES, which is where that fact actually lives.
 */
import * as Location from "expo-location";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useHomeLocation, type HomeLocationApi } from "../home-location";

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
const reverse = Location.reverseGeocodeAsync as jest.Mock;

const PICK = { label: "Gava's Kitchen", lat: -17.8292, lng: 31.0522 };

let api: HomeLocationApi;
function Harness(): null {
  api = useHomeLocation();
  return null;
}

let tree: ReactTestRenderer | null = null;

/** Mount and let every awaited step of the hook's async chain settle. */
async function mount(): Promise<void> {
  await act(async () => {
    tree = create(<Harness />);
  });
  await act(async () => undefined);
}

/** Let a pending reverse-geocode resolve and its setState land. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Permission refused, so the mount-time detection stops immediately and these tests are only
  // about the manual pick.
  getPerm.mockResolvedValue({ status: "denied", granted: false, canAskAgain: false });
  reverse.mockResolvedValue([{ street: "Lanark Rd", streetNumber: "12", district: "Belgravia", city: "Harare" }]);
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe("useHomeLocation · setManualPlace back-fills the suburb", () => {
  it("keeps the customer's chosen label and fills in the area from the picked point", async () => {
    await mount();
    await act(async () => {
      api.setManualPlace(PICK);
    });
    // The pick paints immediately — the customer never waits on a geocode to see their choice.
    expect(api.label).toBe("Gava's Kitchen");
    expect(api.source).toBe("manual");

    await settle();
    // ...and the suburb arrives behind it, without rewriting the label they picked.
    expect(api.label).toBe("Gava's Kitchen");
    expect(api.area).toBe("Belgravia");
  });

  it("does not re-geocode a pick that already carries an area", async () => {
    await mount();
    await act(async () => {
      api.setManualPlace({ ...PICK, area: "Avondale" });
    });
    await settle();
    expect(api.area).toBe("Avondale");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("leaves the area null when the geocoder names no suburb — never a guess", async () => {
    reverse.mockResolvedValue([{ street: "Lanark Rd", streetNumber: "12" }]);
    await mount();
    await act(async () => {
      api.setManualPlace(PICK);
    });
    await settle();
    expect(api.label).toBe("Gava's Kitchen");
    expect(api.area).toBeNull();
  });

  it("survives a geocoder failure without disturbing the pick", async () => {
    reverse.mockRejectedValue(new Error("offline"));
    await mount();
    await act(async () => {
      api.setManualPlace(PICK);
    });
    await settle();
    expect(api.label).toBe("Gava's Kitchen");
    expect(api.area).toBeNull();
  });

  it("never lets a slow lookup for an earlier pick land on top of a later one", async () => {
    await mount();
    // Pick 1's geocode hangs; pick 2's resolves. Pick 2 must win, and pick 1's late answer is dropped.
    let releaseFirst: (v: unknown) => void = () => undefined;
    reverse.mockImplementationOnce(() => new Promise((res) => (releaseFirst = res)));
    reverse.mockResolvedValueOnce([{ district: "Avondale" }]);

    await act(async () => {
      api.setManualPlace({ label: "First", lat: -17.8, lng: 31.05 });
    });
    await act(async () => {
      api.setManualPlace({ label: "Second", lat: -17.9, lng: 31.06 });
    });
    await settle();
    expect(api.label).toBe("Second");
    expect(api.area).toBe("Avondale");

    // The stale answer arrives late and must be discarded, not painted over the standing pick.
    await act(async () => {
      releaseFirst([{ district: "Belgravia" }]);
    });
    await settle();
    expect(api.label).toBe("Second");
    expect(api.area).toBe("Avondale");
  });
});
