/**
 * send.tsx — the stepped Send flow (ledger D-52; handoff packages/design/handoff/send-compose-v2):
 * 1 Where · 2 What · 3 Price · 4 Review. These drive the real screen, mocking only the native map, the
 * API, Places/geocoder and storage edges, and cover: the on-hold wall, inline address editing (the row
 * IS the search field — no search or confirm screen), out-of-area, each step's gate and hints, the
 * price rules, the Review → broadcast path (no disclaimer, no landmark field, declared value 0), the
 * send failure / offline states, "Send again", Back, and the pickup auto-locate.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { quoteFare } from "@lynia/shared";
import type { PickedPoint } from "../../src/ui/MapPicker";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

// Inside the launch corridor (SERVICE_CORRIDOR): pickup at the centre, drop-offs a short way off.
const PICKUP: PickedPoint = { lat: -17.8292, lng: 31.0522 };
const DROPOFF: PickedPoint = { lat: -17.82, lng: 31.06 };
const DROPOFF_FAR: PickedPoint = { lat: -17.75, lng: 31.12 };
// Well outside the 25 km corridor.
const DROPOFF_OUT: PickedPoint = { lat: -15.4167, lng: 28.2833 }; // Lusaka, Zambia

const mockCreateOrder = jest.fn();
const mockGetMe = jest.fn();
const mockLoadRecipients = jest.fn(async () => [] as { name: string; phone: string }[]);
let mockMyPhone = "";
let mockOnline = true;
let mockPlacesOn = true;
const mockAutocomplete = jest.fn(async (_q: string, _t?: string) => [] as { placeId: string; primary: string; secondary: string }[]);
const mockDetails = jest.fn(async (_id: string, _t?: string, _name?: string) => null as null | { lat: number; lng: number; landmark: string; placeId: string });
const mockGeocode = jest.fn(async (_q: string) => ({ ok: false as const, reason: "not-found" as const }) as unknown);

let mockSecureStore: Record<string, string> = {};
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  mockSecureStore[key] = value;
});

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, [cb]);
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockSecureStore[k] ?? null,
  setItemAsync: (...a: [string, string]) => mockSetItemAsync(...a),
  deleteItemAsync: async (k: string) => {
    delete mockSecureStore[k];
  },
}));
jest.mock("../../src/api/auth", () => ({ getMe: (...a: unknown[]) => mockGetMe(...a) }));
jest.mock("../../src/api/orders", () => ({ createOrder: (...a: unknown[]) => mockCreateOrder(...a) }));
jest.mock("../../src/api/places", () => ({
  placesEnabled: () => mockPlacesOn,
  autocompletePlaces: (q: string, t?: string) => mockAutocomplete(q, t),
  placeDetails: (id: string, t?: string, n?: string) => mockDetails(id, t, n),
}));
jest.mock("../../src/logic/geocode", () => ({
  ...jest.requireActual("../../src/logic/geocode"),
  geocodeAddress: (q: string) => mockGeocode(q),
}));
jest.mock("../../src/net/use-reachability", () => ({ useReachability: () => mockOnline }));
jest.mock("../../src/logic/saved-recipients", () => ({
  loadRecipients: () => mockLoadRecipients(),
  loadMyPickupPhone: async () => mockMyPhone,
  rememberRecipient: async () => undefined,
  saveMyPickupPhone: async () => undefined,
}));
// The native map is stubbed: plain testID Pressables call the screen's real map callbacks, and the
// props the screen hands the map (hint, distance, labels) are echoed back as testIDs to assert on.
// `mockMapLife` counts mounts / unmounts (P36: one native map for the whole compose session).
const mockMapLife = { mounts: 0, unmounts: 0, hidden: [] as boolean[] };
jest.mock("../../src/ui/ComposeMap", () => {
  const React_ = require("react");
  const { Pressable, Text } = require("react-native");
  type MockMapProps = {
    onChangePickup: (p: PickedPoint) => void;
    onChangeDrop: (p: PickedPoint) => void;
    onReverseGeocodePickup?: (l: string) => void;
    onReverseGeocodeDrop?: (l: string) => void;
    hint?: string | null;
    distanceLabel?: string | null;
    labels?: boolean;
    hidden?: boolean;
  };
  const Life = ({ hidden }: { hidden?: boolean }) => {
    mockMapLife.hidden.push(!!hidden);
    React_.useEffect(() => {
      mockMapLife.mounts++;
      return () => {
        mockMapLife.unmounts++;
      };
    }, []);
    return null;
  };
  const btn = (testID: string, onPress: () => void) => React_.createElement(Pressable, { key: testID, testID, onPress });
  return {
    ComposeMap: (props: MockMapProps) =>
      React_.createElement(
        React_.Fragment,
        null,
        React_.createElement(Life, { key: "life", hidden: props.hidden }),
        btn("test-set-pickup", () => {
          props.onChangePickup(PICKUP);
          props.onReverseGeocodePickup?.("Test Pickup Spot");
        }),
        btn("test-set-drop", () => {
          props.onChangeDrop(DROPOFF);
          props.onReverseGeocodeDrop?.("Test Drop Spot");
        }),
        btn("test-set-drop-far", () => {
          props.onChangeDrop(DROPOFF_FAR);
          props.onReverseGeocodeDrop?.("Far Drop Spot");
        }),
        btn("test-set-drop-out", () => {
          props.onChangeDrop(DROPOFF_OUT);
          props.onReverseGeocodeDrop?.("Lusaka");
        }),
        React_.createElement(Text, { key: "h", testID: "map-hint" }, props.hint ?? ""),
        React_.createElement(Text, { key: "d", testID: "map-distance" }, props.distanceLabel ?? ""),
        React_.createElement(Text, { key: "l", testID: "map-labels" }, props.labels ? "on" : "off"),
      ),
  };
});

type LocationPermission = { granted: boolean; canAskAgain: boolean; status: string };
type Fix = { coords: { latitude: number; longitude: number } } | null;
const DENIED: LocationPermission = { granted: false, canAskAgain: false, status: "denied" };
const GRANTED: LocationPermission = { granted: true, canAskAgain: true, status: "granted" };
const mockGetPerm = jest.fn(async (): Promise<LocationPermission> => DENIED);
const mockRequestPerm = jest.fn(async (): Promise<LocationPermission> => GRANTED);
const mockLastKnown = jest.fn(async (): Promise<Fix> => null);
const mockCurrent = jest.fn(async (): Promise<Fix> => null);
const mockReverse = jest.fn(async () => [] as { name: string | null; street: string | null; district: string | null }[]);
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: () => mockGetPerm(),
  requestForegroundPermissionsAsync: () => mockRequestPerm(),
  getLastKnownPositionAsync: () => mockLastKnown(),
  getCurrentPositionAsync: () => mockCurrent(),
  reverseGeocodeAsync: () => mockReverse(),
}));

function grantLocation(): void {
  mockGetPerm.mockImplementation(async () => GRANTED);
  mockCurrent.mockImplementation(async () => ({ coords: { latitude: PICKUP.lat, longitude: PICKUP.lng } }));
  mockReverse.mockImplementation(async () => [{ name: "My Current Spot", street: null, district: "Harare CBD" }]);
}

import SendScreen from "../send";
import { ApiError, configureApi } from "../../src/api/client";

// The signed-in account the U17 draft is written for (null = signed out).
let mockProfileId: string | null = "p1";

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────

type Tree = renderer.ReactTestRenderer;

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => setTimeout(r, 0));
  });
}

function render(qc: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): Tree {
  let tree!: Tree;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <SendScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

function texts(tree: Tree): string[] {
  const out: string[] = [];
  for (const n of tree.root.findAll((x) => (x.type as unknown) === "Text")) {
    const c = n.props.children;
    const flat = (Array.isArray(c) ? c : [c]).filter((v: unknown) => typeof v === "string").join("");
    if (flat) out.push(flat);
  }
  return out;
}
const has = (tree: Tree, s: string): boolean => texts(tree).some((t) => t.includes(s));
const testText = (tree: Tree, id: string): string => {
  const n = tree.root.findByProps({ testID: id });
  return String(n.props.children ?? "");
};

function pressTestId(tree: Tree, testID: string): void {
  act(() => tree.root.findByProps({ testID }).props.onPress());
}

/** The pressable carrying this accessibilityLabel (exact, or prefix when `prefix`). */
function pressable(tree: Tree, label: string, prefix = false) {
  const nodes = tree.root.findAll(
    (n) =>
      typeof n.props.onPress === "function" &&
      typeof n.props.accessibilityLabel === "string" &&
      (prefix ? n.props.accessibilityLabel.startsWith(label) : n.props.accessibilityLabel === label),
  );
  if (!nodes[0]) throw new Error(`no pressable labelled ${label}`);
  return nodes[0];
}
function press(tree: Tree, label: string, prefix = false): void {
  const n = pressable(tree, label, prefix);
  act(() => n.props.onPress());
}
function isDisabled(tree: Tree, label: string): boolean {
  return pressable(tree, label).props.disabled === true;
}
function input(tree: Tree, label: string) {
  const n = tree.root.findAll((x) => x.props.accessibilityLabel === label && typeof x.props.onChangeText === "function")[0];
  if (!n) throw new Error(`no input labelled ${label}`);
  return n;
}
function type(tree: Tree, label: string, value: string): void {
  const n = input(tree, label);
  act(() => n.props.onChangeText(value));
}
function blur(tree: Tree, label: string): void {
  const n = input(tree, label);
  act(() => n.props.onBlur?.({}));
}

/** Step 1 done by map taps: pickup + drop-off inside the corridor, then Next. */
function completeWhere(tree: Tree): void {
  pressTestId(tree, "test-set-pickup");
  pressTestId(tree, "test-set-drop");
  press(tree, "Next");
}
/** Step 2 done: one item and both phones, then Next. */
function completeWhat(tree: Tree): void {
  type(tree, "Item 1", "Documents envelope");
  type(tree, "Your phone (sender)", "0772451180");
  type(tree, "Recipient phone", "0715550090");
  press(tree, "Next");
}

let active: Tree | null = null;
beforeEach(() => {
  mockProfileId = "p1";
  configureApi({
    getSession: () => (mockProfileId ? { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: mockProfileId, role: "customer" } : null),
    onTokens: async () => undefined,
    onSignOut: () => undefined,
  });
  mockGetPerm.mockImplementation(async () => DENIED);
  mockRequestPerm.mockImplementation(async () => GRANTED);
  mockLastKnown.mockImplementation(async () => null);
  mockCurrent.mockImplementation(async () => null);
  mockReverse.mockImplementation(async () => []);
  mockGetMe.mockResolvedValue({ onHold: false });
  mockAutocomplete.mockImplementation(async () => []);
  mockDetails.mockImplementation(async () => null);
  mockGeocode.mockImplementation(async () => ({ ok: false, reason: "not-found" }));
});
afterEach(async () => {
  if (active) act(() => active!.unmount());
  active = null;
  // The unmount's draft flush is queued on send-draft's write chain: let it land before the store resets.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  mockSecureStore = {};
  mockCanGoBack = true;
  mockParams = {};
  mockMyPhone = "";
  mockOnline = true;
  mockPlacesOn = true;
  jest.clearAllMocks();
});

// ── tests ───────────────────────────────────────────────────────────────────────────────────────────

describe("send.tsx — account on hold (state 17)", () => {
  it("blocks the composer with the hold copy, a support call and Back to home", async () => {
    mockGetMe.mockResolvedValue({ onHold: true });
    active = render();
    await settle();
    expect(has(active, "Your account is on hold")).toBe(true);
    expect(has(active, "You can't send parcels right now. Call us and we'll help you sort it out.")).toBe(true);
    expect(has(active, "Call support")).toBe(true);
    expect(has(active, "PICKUP")).toBe(false);
    press(active, "Back to home");
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("swaps to the hold wall when the server refuses the broadcast as held", async () => {
    mockCreateOrder.mockRejectedValue(new ApiError(403, "Your account is paused", "on_hold"));
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    press(active, "Review");
    mockGetMe.mockResolvedValue({ onHold: true }); // the hold landed after /auth/me was cached
    press(active, "Send to bikers");
    await settle();
    expect(has(active, "Your account is on hold")).toBe(true);
  });

  it("U46: the wall lifts when support lifts the hold, with the order still filled in", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(403, "Your account is paused", "on_hold"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    active = render(qc);
    await settle();
    completeWhere(active);
    completeWhat(active);
    press(active, "Review");
    mockGetMe.mockResolvedValue({ onHold: true });
    press(active, "Send to bikers");
    await settle();
    expect(has(active, "Your account is on hold")).toBe(true);
    // The wall's minute poll reads the lifted hold.
    mockGetMe.mockResolvedValue({ onHold: false });
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["me"] });
    });
    await settle();
    expect(has(active, "Your account is on hold")).toBe(false);
    expect(has(active, "Documents envelope × 1")).toBe(true);
    expect(isDisabled(active, "Send to bikers")).toBe(false);
  });

  it("U45: a banned or suspended sender lands on the hold wall, not a Try again that can't succeed", async () => {
    for (const code of ["account_suspended", "account_banned"]) {
      mockCreateOrder.mockRejectedValueOnce(new ApiError(403, "Your account is not in good standing.", code));
      active = render();
      await settle();
      completeWhere(active);
      completeWhat(active);
      press(active, "Review");
      press(active, "Send to bikers");
      await settle();
      // /auth/me says onHold false for a rider's standing: the wall must stay anyway.
      expect(has(active, "Your account is on hold")).toBe(true);
      expect(has(active, "Couldn't send. Check your data and try again.")).toBe(false);
      act(() => active!.unmount());
      active = null;
      // U17: the next round starts from a fresh install, not from this round's saved compose.
      await settle();
      mockSecureStore = {};
    }
  });
});

describe("send.tsx — step 1 · Where", () => {
  it("opens on step 1 with the step bar, empty rows and a disabled Next", async () => {
    active = render();
    await settle();
    expect(has(active, "Send a parcel")).toBe(true);
    for (const s of ["Where", "What", "Price", "Review"]) expect(has(active, s)).toBe(true);
    expect(has(active, "Set pickup location")).toBe(true);
    expect(has(active, "Where to?")).toBe(true);
    expect(isDisabled(active, "Next")).toBe(true);
    // Nothing from the retired composer survives.
    for (const gone of ["Landmarks & details", "Declared value", "Proceed", "Broadcast request", "Agree & broadcast"]) {
      expect(has(active, gone)).toBe(false);
    }
  });

  it("asks for the drop-off once the pickup is set, and enables Next when both pins are in", async () => {
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    expect(has(active, "Test Pickup Spot")).toBe(true);
    expect(has(active, "Add a drop-off to continue.")).toBe(true);
    expect(testText(active, "map-hint")).toBe("Or tap the map to set your drop-off");
    pressTestId(active, "test-set-drop");
    expect(has(active, "Test Drop Spot")).toBe(true);
    expect(has(active, "Add a drop-off to continue.")).toBe(false);
    expect(isDisabled(active, "Next")).toBe(false);
    expect(testText(active, "map-distance")).toMatch(/^\d+\.\d km$/);
  });

  it("U47: a drop-off on the pickup (Use my location twice) is not a trip — Next stays off, the hint asks again", async () => {
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    const stub = active.root.findAll((n) => typeof n.props.onChangeDrop === "function")[0];
    act(() => stub!.props.onChangeDrop(PICKUP));
    expect(isDisabled(active, "Next")).toBe(true);
    expect(has(active, "Add a drop-off to continue.")).toBe(true);
    expect(testText(active, "map-distance")).toBe("");
    pressTestId(active, "test-set-drop");
    expect(isDisabled(active, "Next")).toBe(false);
    expect(has(active, "Add a drop-off to continue.")).toBe(false);
  });

  it("names a pin by its coordinates when the geocoder can't, so the stop is never blank", async () => {
    active = render();
    await settle();
    // A map tap with no reverse-geocode answer: drive the map's callback directly, without a name.
    const stub = active.root.findAll((n) => typeof n.props.onChangePickup === "function")[0];
    act(() => stub!.props.onChangePickup(PICKUP));
    expect(has(active, `${PICKUP.lat.toFixed(5)}, ${PICKUP.lng.toFixed(5)}`)).toBe(true);
  });

  it("flags a stop outside the service area and keeps Next disabled", async () => {
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    pressTestId(active, "test-set-drop-out");
    expect(has(active, "Outside our area")).toBe(true);
    expect(has(active, "We don't cover that pickup or drop-off yet. We deliver across Zimbabwe.")).toBe(true);
    expect(isDisabled(active, "Next")).toBe(true);
    expect(testText(active, "map-distance")).toBe("");
    pressTestId(active, "test-set-drop");
    expect(has(active, "Outside our area")).toBe(false);
    expect(isDisabled(active, "Next")).toBe(false);
  });
});

describe("send.tsx — inline address editing (no search screen, no confirm screen)", () => {
  it("turns the tapped row into the input, hides the step bar, and a picked suggestion moves the pin", async () => {
    mockAutocomplete.mockImplementation(async () => [
      { placeId: "p1", primary: "14 Glenara Avenue", secondary: "Avenues, Harare" },
      { placeId: "p2", primary: "Glenara Avenue North", secondary: "Highlands, Harare" },
    ]);
    mockDetails.mockImplementation(async () => ({ lat: DROPOFF.lat, lng: DROPOFF.lng, landmark: "14 Glenara Ave, Avenues", placeId: "p1" }));
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    press(active, "DROP-OFF.", true);
    // The row is now an input in place; the step bar collapses and the map labels hide.
    expect(input(active, "DROP-OFF address")).toBeTruthy();
    expect(has(active, "Where")).toBe(false);
    expect(testText(active, "map-labels")).toBe("off");
    expect(has(active, "Use my current location")).toBe(true);
    expect(has(active, "Tap the map to set the pin")).toBe(true);
    type(active, "DROP-OFF address", "14 Glenara");
    await settle(400);
    expect(mockAutocomplete).toHaveBeenCalledWith("14 Glenara", expect.any(String));
    expect(has(active, "14 Glenara Avenue")).toBe(true);
    expect(has(active, "Avenues, Harare")).toBe(true);
    press(active, "14 Glenara Avenue, Avenues, Harare");
    await settle();
    expect(mockDetails).toHaveBeenCalledWith("p1", expect.any(String), "14 Glenara Avenue");
    // Committed straight to the row — no confirm step — and the editor closed.
    expect(has(active, "14 Glenara Ave, Avenues")).toBe(true);
    expect(active.root.findAll((n) => n.props.accessibilityLabel === "DROP-OFF address").length).toBe(0);
    expect(isDisabled(active, "Next")).toBe(false);
  });

  it("says No matches when neither Places nor the device geocoder finds the text", async () => {
    active = render();
    await settle();
    press(active, "DROP-OFF.", true);
    type(active, "DROP-OFF address", "14 Glenaraa");
    await settle(400);
    expect(mockGeocode).toHaveBeenCalledWith("14 Glenaraa");
    expect(has(active, "No matches. Check the spelling, or set the pin on the map.")).toBe(true);
  });

  it("U18: a tapped suggestion shows it is working, ignores a re-tap, and says No matches when the lookup fails", async () => {
    mockAutocomplete.mockImplementation(async () => [{ placeId: "p1", primary: "14 Glenara Avenue", secondary: "Avenues, Harare" }]);
    let finish: (v: null) => void = () => {};
    mockDetails.mockImplementation(() => new Promise((r) => (finish = r)));
    active = render();
    await settle();
    press(active, "DROP-OFF.", true);
    type(active, "DROP-OFF address", "14 Glenara");
    await settle(400);
    press(active, "14 Glenara Avenue, Avenues, Harare");
    const row = pressable(active, "14 Glenara Avenue, Avenues, Harare");
    expect(row.props.accessibilityState).toEqual({ busy: true });
    press(active, "14 Glenara Avenue, Avenues, Harare");
    expect(mockDetails).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(null);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(has(active, "No matches. Check the spelling, or set the pin on the map.")).toBe(true);
    // Still editing: typing again brings the suggestions back.
    type(active, "DROP-OFF address", "14 Glenara Av");
    await settle(400);
    expect(has(active, "14 Glenara Avenue")).toBe(true);
  });

  it("U18: only the latest pick lands — a slower earlier answer is dropped", async () => {
    mockAutocomplete.mockImplementation(async () => [
      { placeId: "pA", primary: "Avenue A", secondary: "Avenues, Harare" },
      { placeId: "pB", primary: "Avenue B", secondary: "Highlands, Harare" },
    ]);
    const pending: Record<string, (v: { lat: number; lng: number; landmark: string; placeId: string }) => void> = {};
    mockDetails.mockImplementation((id: string) => new Promise((r) => (pending[id] = r)));
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    press(active, "DROP-OFF.", true);
    type(active, "DROP-OFF address", "Avenue");
    await settle(400);
    press(active, "Avenue A, Avenues, Harare");
    press(active, "Avenue B, Highlands, Harare");
    await act(async () => {
      pending.pB!({ lat: DROPOFF.lat, lng: DROPOFF.lng, landmark: "Avenue B, Highlands", placeId: "pB" });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      pending.pA!({ lat: DROPOFF_FAR.lat, lng: DROPOFF_FAR.lng, landmark: "Avenue A, Avenues", placeId: "pA" });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(has(active, "Avenue B, Highlands")).toBe(true);
    expect(has(active, "Avenue A, Avenues")).toBe(false);
  });

  it("falls back to the limited (device geocoder) search with no Places key", async () => {
    mockPlacesOn = false;
    mockGeocode.mockImplementation(async () => ({ ok: true, place: { lat: DROPOFF.lat, lng: DROPOFF.lng, landmark: "14 Glenara Avenue, Harare", placeId: "" } }));
    active = render();
    await settle();
    press(active, "DROP-OFF.", true);
    expect(has(active, "Search is limited right now. Type the street and area, or use the map.")).toBe(true);
    type(active, "DROP-OFF address", "14 Glenara Avenue");
    await settle(700);
    expect(mockAutocomplete).not.toHaveBeenCalled();
    press(active, "14 Glenara Avenue, Harare");
    await settle();
    expect(has(active, "14 Glenara Avenue, Harare")).toBe(true);
  });

  it("Back while typing closes the editor instead of leaving the flow", async () => {
    active = render();
    await settle();
    press(active, "DROP-OFF.", true);
    press(active, "Back");
    expect(mockBack).not.toHaveBeenCalled();
    expect(has(active, "Where")).toBe(true);
  });
});

describe("send.tsx — P36: the step-1 map survives Next and Back", () => {
  it("is mounted once for the session — hidden on step 2, the same map again on Back", async () => {
    mockMapLife.mounts = 0;
    mockMapLife.unmounts = 0;
    active = render();
    await settle();
    completeWhere(active);
    expect(has(active, "What are you sending?")).toBe(true);
    expect(mockMapLife.hidden[mockMapLife.hidden.length - 1]).toBe(true);
    press(active, "Back");
    expect(mockMapLife.hidden[mockMapLife.hidden.length - 1]).toBe(false);
    expect(mockMapLife.mounts).toBe(1);
    expect(mockMapLife.unmounts).toBe(0);
  });
});

describe("send.tsx — step 2 · What and who", () => {
  async function atStep2(): Promise<Tree> {
    active = render();
    await settle();
    completeWhere(active);
    return active;
  }

  it("shows the route strip, the fields, and names what is still needed", async () => {
    const t = await atStep2();
    expect(has(t, "What are you sending?")).toBe(true);
    expect(has(t, "Test Pickup Spot")).toBe(true);
    expect(has(t, "Note for the biker (optional)")).toBe(true);
    expect(has(t, "Still needed: what you're sending, your phone, recipient phone")).toBe(true);
    expect(isDisabled(t, "Next")).toBe(true);
    type(t, "Item 1", "Docs");
    type(t, "Your phone (sender)", "0772451180");
    expect(has(t, "Still needed: recipient phone")).toBe(true);
    type(t, "Recipient phone", "0715550090");
    expect(isDisabled(t, "Next")).toBe(false);
  });

  it("prefills the sender's own remembered number", async () => {
    mockMyPhone = "0772451180";
    const t = await atStep2();
    expect(input(t, "Your phone (sender)").props.value).toBe("0772451180");
    expect(has(t, "Still needed: what you're sending, recipient phone")).toBe(true);
  });

  it("U48: a first-time sender gets the account's own number, as drawn", async () => {
    mockGetMe.mockResolvedValue({ onHold: false, phone: "+263772451180" });
    const t = await atStep2();
    await settle();
    expect(input(t, "Your phone (sender)").props.value).toBe("+263 77 245 1180");
    expect(has(t, "Still needed: what you're sending, recipient phone")).toBe(true);
  });

  it("U48: a remembered number wins over the account's", async () => {
    mockMyPhone = "0712345678";
    mockGetMe.mockResolvedValue({ onHold: false, phone: "+263772451180" });
    const t = await atStep2();
    await settle();
    expect(input(t, "Your phone (sender)").props.value).toBe("0712345678");
  });

  it("adds and removes item cards, and swaps Add for the 10-item notice at the cap", async () => {
    const t = await atStep2();
    expect(t.root.findAll((n) => n.props.accessibilityLabel === "Remove item 1" && n.props.onPress).length).toBe(0);
    press(t, "Add another item");
    expect(input(t, "Item 2")).toBeTruthy();
    press(t, "Remove item 2");
    expect(t.root.findAll((n) => n.props.accessibilityLabel === "Item 2").length).toBe(0);
    for (let i = 0; i < 9; i++) press(t, "Add another item");
    expect(has(t, "Up to 10 items per order.")).toBe(true);
    expect(t.root.findAll((n) => n.props.accessibilityLabel === "Add another item").length).toBe(0);
  });

  it("steps the quantity between 1 and 99", async () => {
    const t = await atStep2();
    expect(isDisabled(t, "Fewer of item 1")).toBe(true);
    press(t, "More of item 1");
    expect(t.root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === 2).length).toBeGreaterThan(0);
    expect(isDisabled(t, "Fewer of item 1")).toBe(false);
  });

  it("shows a recipient phone error on blur, not while typing", async () => {
    const t = await atStep2();
    type(t, "Recipient phone", "077 12");
    expect(has(t, "That doesn't look like a phone number")).toBe(false);
    blur(t, "Recipient phone");
    expect(has(t, "That doesn't look like a phone number")).toBe(true);
    type(t, "Recipient phone", "0715550090");
    expect(has(t, "That doesn't look like a phone number")).toBe(false);
  });

  it("offers recent-recipient chips while the field is empty; a tap fills it", async () => {
    mockLoadRecipients.mockResolvedValueOnce([{ name: "Rita", phone: "+263715550090" }]);
    const t = await atStep2();
    press(t, "Use recipient Rita");
    expect(input(t, "Recipient phone").props.value).toBe("0715550090");
    expect(t.root.findAll((n) => n.props.accessibilityLabel === "Use recipient Rita").length).toBe(0);
  });

  it("Back returns to step 1 with everything kept; Edit on the route strip does the same", async () => {
    const t = await atStep2();
    type(t, "Item 1", "Docs");
    press(t, "Back");
    expect(mockBack).not.toHaveBeenCalled();
    expect(has(t, "Test Drop Spot")).toBe(true);
    press(t, "Next");
    expect(input(t, "Item 1").props.value).toBe("Docs");
    press(t, "Edit the route");
    expect(has(t, "PICKUP")).toBe(true);
  });
});

describe("send.tsx — step 3 · Price", () => {
  const suggested = quoteFare(PICKUP, DROPOFF).suggestedFare;

  async function atStep3(): Promise<Tree> {
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    return active;
  }
  const priceText = (t: Tree): string => input(t, "Your price in US dollars").props.value;

  it("starts at the suggested fare with the band and Cash to your biker", async () => {
    const t = await atStep3();
    expect(priceText(t)).toBe(suggested.toFixed(2));
    expect(has(t, "Bikers usually accept around $")).toBe(true);
    expect(has(t, "Cash to your biker")).toBe(true);
    expect(isDisabled(t, "Review")).toBe(false);
  });

  it("− / + move the price in $0.50 steps and never below $0.50", async () => {
    const t = await atStep3();
    press(t, "+ $0.50");
    expect(priceText(t)).toBe((suggested + 0.5).toFixed(2));
    type(t, "Your price in US dollars", "0.60");
    press(t, "− $0.50");
    expect(priceText(t)).toBe("0.50");
    press(t, "− $0.50");
    expect(priceText(t)).toBe("0.50");
  });

  it("keeps typed prices to two decimals", async () => {
    const t = await atStep3();
    type(t, "Your price in US dollars", "3,456");
    expect(priceText(t)).toBe("3.45");
  });

  it("warns softly below the band and far above it, never blocking Review", async () => {
    const t = await atStep3();
    type(t, "Your price in US dollars", "0.50");
    expect(has(t, "That's below what bikers usually take — they may pass. Nudge it up for a faster match.")).toBe(true);
    expect(isDisabled(t, "Review")).toBe(false);
    type(t, "Your price in US dollars", "99");
    expect(has(t, "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.")).toBe(true);
    expect(isDisabled(t, "Review")).toBe(false);
    type(t, "Your price in US dollars", "");
    expect(isDisabled(t, "Review")).toBe(true);
  });

  it("U61: a price above $100,000 keeps Review disabled", async () => {
    const t = await atStep3();
    type(t, "Your price in US dollars", "250000");
    expect(isDisabled(t, "Review")).toBe(true);
    type(t, "Your price in US dollars", "100000");
    expect(isDisabled(t, "Review")).toBe(false);
  });

  it("re-suggests over a typed price when a pin moves", async () => {
    const t = await atStep3();
    type(t, "Your price in US dollars", "7.00");
    press(t, "Back");
    press(t, "Back");
    pressTestId(t, "test-set-drop-far");
    press(t, "Next");
    press(t, "Next");
    expect(priceText(t)).toBe(quoteFare(PICKUP, DROPOFF_FAR).suggestedFare.toFixed(2));
  });
});

describe("send.tsx — step 4 · Review and send", () => {
  async function atReview(qc?: QueryClient): Promise<Tree> {
    active = render(qc);
    await settle();
    completeWhere(active);
    type(active, "Item 1", "Documents envelope");
    type(active, "Note for the biker (optional)", "Blue gate. Ask for Rita.");
    type(active, "Your phone (sender)", "0772451180");
    type(active, "Recipient phone", "0715550090");
    press(active, "Next");
    type(active, "Your price in US dollars", "3.36");
    press(active, "Review");
    return active;
  }

  it("summarises route, items, note, phones and the pinned price", async () => {
    const t = await atReview();
    expect(has(t, "ROUTE")).toBe(true);
    expect(has(t, "Test Pickup Spot")).toBe(true);
    expect(has(t, "Test Drop Spot")).toBe(true);
    expect(has(t, "Documents envelope × 1")).toBe(true);
    expect(has(t, "Blue gate. Ask for Rita.")).toBe(true);
    expect(has(t, "077 245 1180") || has(t, "0772451180")).toBe(true);
    expect(has(t, "$3.36")).toBe(true);
    expect(has(t, "Send to bikers")).toBe(true);
    press(t, "Edit the price");
    expect(input(t, "Your price in US dollars")).toBeTruthy();
  });

  it("broadcasts straight to the auction — no disclaimer, address names as labels, declared value 0", async () => {
    mockCreateOrder.mockResolvedValue({ id: "o-1", status: "open_for_offers", proposedFare: 3.36, expiresAt: new Date().toISOString(), ridersNearby: 2 });
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const body = mockCreateOrder.mock.calls[0][0];
    expect(body.pickup.landmark).toBe("Test Pickup Spot");
    expect(body.dropoff.landmark).toBe("Test Drop Spot");
    expect(body.pickup.contactPhone).toBe("+263772451180");
    expect(body.dropoff.contactPhone).toBe("+263715550090");
    expect(body.items).toEqual([{ description: "Documents envelope", quantity: 1 }]);
    expect(body.note).toBe("Blue gate. Ask for Rita.");
    expect(body.declaredValue).toBe(0);
    expect(body.proposedFare).toBe(3.36);
    expect(body.disclaimerVersion).toBeUndefined();
    expect(typeof body.idempotencyKey).toBe("string");
    expect(mockReplace).toHaveBeenCalledWith("/order/o-1");
    expect(has(t, "Agree & broadcast")).toBe(false);
  });

  it("shows the failed toast with Try again, keeping everything, and retries", async () => {
    mockCreateOrder.mockRejectedValueOnce(new Error("network"));
    mockCreateOrder.mockResolvedValueOnce({ id: "o-2", status: "open_for_offers", proposedFare: 3.36, expiresAt: new Date().toISOString() });
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    expect(has(t, "Couldn't send. Check your data and try again.")).toBe(true);
    expect(has(t, "Documents envelope × 1")).toBe(true);
    press(t, "Try again");
    await settle();
    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    // Same order, same idempotency key — a retry can't open a second auction.
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).toBe(mockCreateOrder.mock.calls[0][0].idempotencyKey);
    expect(mockReplace).toHaveBeenCalledWith("/order/o-2");
  });

  it("U16: after a send with no answer, an edit still replays the SAME key — no second auction", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(0, "The network is slow — check your connection and try again."));
    mockCreateOrder.mockResolvedValueOnce({ id: "o-3", status: "open_for_offers", proposedFare: 3.36, expiresAt: new Date().toISOString() });
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    expect(has(t, "Couldn't send. Check your data and try again.")).toBe(true);
    // The customer "checks their data": edits the price, then sends again.
    press(t, "Edit the price");
    type(t, "Your price in US dollars", "4.00");
    press(t, "Review");
    press(t, "Send to bikers");
    await settle();
    // The answer is the $3.36 order the lost send made: it is the live one, and the app goes to it.
    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).toBe(mockCreateOrder.mock.calls[0][0].idempotencyKey);
    expect(mockReplace).toHaveBeenCalledWith("/order/o-3");
  });

  it("U16: Try again after a lost send replays the key and lands on the order it made", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(0, "The network is slow — check your connection and try again."));
    mockCreateOrder.mockResolvedValueOnce({ id: "o-3", status: "open_for_offers", proposedFare: "3.36", distanceKm: null, expiresAt: new Date().toISOString(), ridersNearby: null });
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    press(t, "Try again");
    await settle();
    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).toBe(mockCreateOrder.mock.calls[0][0].idempotencyKey);
    expect(mockReplace).toHaveBeenCalledWith("/order/o-3");
  });

  it("U16 review: a hold refusal keeps the key — after the lift, the resend replays it", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(403, "Your account is paused", "on_hold"));
    mockCreateOrder.mockResolvedValueOnce({ id: "o-h", status: "open_for_offers", proposedFare: 3.36, expiresAt: new Date().toISOString() });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const t = await atReview(qc);
    mockGetMe.mockResolvedValue({ onHold: true });
    press(t, "Send to bikers");
    await settle();
    mockGetMe.mockResolvedValue({ onHold: false });
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["me"] });
    });
    await settle();
    press(t, "Send to bikers");
    await settle();
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).toBe(mockCreateOrder.mock.calls[0][0].idempotencyKey);
  });

  it("U16: a 4xx settles the send — the next one after an edit is a new order with a new key", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(400, "Bad request"));
    mockCreateOrder.mockResolvedValueOnce({ id: "o-4", status: "open_for_offers", proposedFare: 4, expiresAt: new Date().toISOString() });
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    press(t, "Edit the price");
    type(t, "Your price in US dollars", "4.00");
    press(t, "Review");
    press(t, "Send to bikers");
    await settle();
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).not.toBe(mockCreateOrder.mock.calls[0][0].idempotencyKey);
  });

  it("U16: offline after a failed send, the toast drops its Try again (the banner and hint say what to do)", async () => {
    mockCreateOrder.mockRejectedValueOnce(new ApiError(0, "Can't reach LyniaGo — check your connection and try again."));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const t = await atReview(qc);
    press(t, "Send to bikers");
    await settle();
    expect(has(t, "Try again")).toBe(true);
    mockOnline = false;
    act(() =>
      t.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <QueryClientProvider client={qc}>
            <SendScreen />
          </QueryClientProvider>
        </SafeAreaProvider>,
      ),
    );
    expect(has(t, "Couldn't send. Check your data and try again.")).toBe(true);
    expect(has(t, "Try again")).toBe(false);
    expect(has(t, "Connect to the internet to send.")).toBe(true);
  });

  it("returns to step 1 with the out-of-area notice when the server refuses the route", async () => {
    mockCreateOrder.mockRejectedValue(new ApiError(422, "Outside the service area", "out_of_area"));
    const t = await atReview();
    press(t, "Send to bikers");
    await settle();
    expect(has(t, "Couldn't send. Check your data and try again.")).toBe(false);
    expect(has(t, "We don't cover that pickup or drop-off yet. We deliver across Zimbabwe.")).toBe(true);
    expect(isDisabled(t, "Next")).toBe(true);
  });

  it("offline: says so and keeps Send to bikers disabled, while the steps stay usable", async () => {
    mockOnline = false;
    const t = await atReview();
    expect(has(t, "You're offline. What you've entered is saved.")).toBe(true);
    expect(has(t, "Connect to the internet to send.")).toBe(true);
    expect(isDisabled(t, "Send to bikers")).toBe(true);
  });
});

describe("send.tsx — Send again", () => {
  const rb = {
    rbPickupLat: "-17.8016",
    rbPickupLng: "31.0431",
    rbPickupLandmark: "Avondale Shops",
    rbDropLat: String(DROPOFF.lat),
    rbDropLng: String(DROPOFF.lng),
    rbDropLandmark: "Drop Spot",
    rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
    rbFare: "4.50",
    rbNote: "",
    rbDate: "2026-09-28T09:00:00Z",
  };

  it("opens prefilled with the banner on the first step still missing something (the recipient)", async () => {
    mockParams = rb;
    mockMyPhone = "0772451180";
    active = render();
    await settle();
    expect(has(active, "Copied from your order on 28 Sep. Check it, then send.")).toBe(true);
    expect(has(active, "What are you sending?")).toBe(true);
    expect(input(active, "Item 1").props.value).toBe("Documents envelope");
    expect(mockGetPerm).not.toHaveBeenCalled();
    type(active, "Recipient phone", "0715550090");
    press(active, "Next");
    // The original price stands over the first suggestion for the same pins.
    expect(input(active, "Your price in US dollars").props.value).toBe("4.50");
    press(active, "Review");
    expect(has(active, "Avondale Shops")).toBe(true);
    press(active, "Back");
    expect(input(active, "Your price in US dollars")).toBeTruthy();
  });
});

describe("send.tsx — leaving the flow", () => {
  it("Back on step 1 pops the stack, or lands on Home when there is none", async () => {
    active = render();
    await settle();
    press(active, "Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    press(active, "Back");
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

});

describe("send.tsx — U17: the compose survives an app kill or a page reload", () => {
  const DRAFT = "lynia.orderDraft";
  const stored = () => JSON.parse(mockSecureStore[DRAFT] ?? "null");

  it("saves the compose (debounced) — addresses, items, note, price, step — but never a phone", async () => {
    active = render();
    await settle();
    completeWhere(active);
    type(active, "Item 1", "Documents envelope");
    type(active, "Note for the biker (optional)", "Blue gate");
    type(active, "Your phone (sender)", "0772451180");
    type(active, "Recipient phone", "0715550090");
    await settle(600);
    const d = stored();
    expect(d.step).toBe(2);
    expect(d.drop.name).toBe("Test Drop Spot");
    expect(d.items).toEqual([{ description: "Documents envelope", quantity: 1 }]);
    expect(d.note).toBe("Blue gate");
    expect(mockSecureStore[DRAFT]).not.toContain("0772451180");
    expect(mockSecureStore[DRAFT]).not.toContain("0715550090");
  });

  it("restores it on the next open, on the first step still missing something (the recipient's phone)", async () => {
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    type(active, "Your price in US dollars", "4.50");
    press(active, "Review");
    await settle(600);
    act(() => active!.unmount());
    // A cold start: a fresh screen reads the stored draft.
    mockMyPhone = "0772451180";
    active = render();
    await settle();
    expect(has(active, "What are you sending?")).toBe(true);
    expect(input(active, "Item 1").props.value).toBe("Documents envelope");
    expect(input(active, "Recipient phone").props.value).toBe("");
    type(active, "Recipient phone", "0715550090");
    press(active, "Next");
    // The typed price comes back as typed, not re-suggested over.
    expect(input(active, "Your price in US dollars").props.value).toBe("4.50");
  });

  it("is written before the request goes out, with the key, and cleared once the order is placed", async () => {
    let answer: (v: unknown) => void = () => {};
    mockCreateOrder.mockReturnValue(new Promise((r) => (answer = r)));
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    press(active, "Review");
    press(active, "Send to bikers");
    await settle();
    const sentKey = mockCreateOrder.mock.calls[0][0].idempotencyKey;
    expect(stored().sentKey).toBe(sentKey);
    await act(async () => {
      answer({ id: "o-9", status: "open_for_offers", proposedFare: 2, expiresAt: new Date().toISOString() });
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    expect(mockSecureStore[DRAFT]).toBeUndefined();
    act(() => active!.unmount());
    active = null;
    expect(mockSecureStore[DRAFT]).toBeUndefined();
  });

  it("U16 + U17: an app killed while a send had no answer replays its key after the relaunch", async () => {
    mockCreateOrder.mockReturnValueOnce(new Promise(() => {}));
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    press(active, "Review");
    press(active, "Send to bikers");
    await settle();
    const firstKey = mockCreateOrder.mock.calls[0][0].idempotencyKey;
    act(() => active!.unmount());
    // The replay answers with the order the first attempt made — the same trip and price.
    mockCreateOrder.mockImplementationOnce(async (b: { proposedFare: number }) => ({ id: "o-1", status: "open_for_offers", proposedFare: b.proposedFare, expiresAt: new Date().toISOString() }));
    active = render();
    await settle();
    type(active, "Your phone (sender)", "0772451180");
    type(active, "Recipient phone", "0715550090");
    press(active, "Next");
    press(active, "Review");
    press(active, "Send to bikers");
    await settle();
    expect(mockCreateOrder.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(mockReplace).toHaveBeenCalledWith("/order/o-1");
  });

  it("Send again ignores a stored draft and opens on the past order", async () => {
    mockSecureStore[DRAFT] = JSON.stringify({
      savedAt: Date.now(),
      step: 2,
      pickup: { lat: PICKUP.lat, lng: PICKUP.lng, name: "Old pickup", source: "map" },
      drop: { lat: DROPOFF_FAR.lat, lng: DROPOFF_FAR.lng, name: "Old drop", source: "map" },
      items: [{ description: "Old parcel", quantity: 1 }],
      note: "",
      priceText: "9.00",
      profileId: "p1",
      sentKey: null,
      sentAt: null,
    });
    mockParams = {
      rbPickupLat: String(PICKUP.lat),
      rbPickupLng: String(PICKUP.lng),
      rbPickupLandmark: "Avondale Shops",
      rbDropLat: String(DROPOFF.lat),
      rbDropLng: String(DROPOFF.lng),
      rbDropLandmark: "Drop Spot",
      rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
      rbFare: "4.50",
    };
    active = render();
    await settle();
    expect(input(active, "Item 1").props.value).toBe("Documents envelope");
  });

  // ── Review of the U16/U17 fix ──
  const SEND_AGAIN = (): Record<string, string> => ({
    rbPickupLat: String(PICKUP.lat),
    rbPickupLng: String(PICKUP.lng),
    rbPickupLandmark: "Avondale Shops",
    rbDropLat: String(DROPOFF.lat),
    rbDropLng: String(DROPOFF.lng),
    rbDropLandmark: "Drop Spot",
    rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
    rbFare: "4.50",
  });
  const storedDraft = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      savedAt: Date.now(),
      profileId: "p1",
      step: 3,
      pickup: { lat: PICKUP.lat, lng: PICKUP.lng, name: "Old pickup", source: "map" },
      drop: { lat: DROPOFF.lat, lng: DROPOFF.lng, name: "Old drop", source: "map" },
      items: [{ description: "Old parcel", quantity: 1 }],
      note: "",
      priceText: "9.00",
      sentKey: null,
      sentAt: null,
      ...over,
    });
  async function sendFromWhat(t: Tree): Promise<void> {
    type(t, "Your phone (sender)", "0772451180");
    type(t, "Recipient phone", "0715550090");
    press(t, "Next");
    press(t, "Review");
    press(t, "Send to bikers");
    await settle();
  }

  it("S1: a flush after an app-driven sign-out never writes the wiped draft back", async () => {
    active = render();
    await settle();
    completeWhere(active);
    type(active, "Item 1", "Documents envelope");
    await settle(600);
    expect(stored()).not.toBeNull();
    // The refresh token expired: the app signs out and clearDeviceState deletes the slot.
    mockProfileId = null;
    delete mockSecureStore[DRAFT];
    type(active, "Note for the biker (optional)", "Blue gate");
    await settle(600);
    act(() => active!.unmount());
    active = null;
    await settle();
    expect(mockSecureStore[DRAFT]).toBeUndefined();
  });

  it("S1: another account's draft is never restored", async () => {
    mockSecureStore[DRAFT] = storedDraft({ step: 2, items: [{ description: "Their parcel", quantity: 1 }] });
    mockProfileId = "p2";
    active = render();
    await settle();
    expect(has(active, "Their parcel")).toBe(false);
    expect(has(active, "Old drop")).toBe(false);
  });

  const LIVE_SENT_ID = "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f";
  const STALE_SENT_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  it("an unanswered-send key older than 10 minutes is not replayed into the restored compose", async () => {
    mockSecureStore[DRAFT] = storedDraft({ step: 2, sentKey: STALE_SENT_ID, sentAt: Date.now() - 20 * 60 * 1000 });
    mockCreateOrder.mockResolvedValueOnce({ id: "o-new", status: "open_for_offers", proposedFare: 9, expiresAt: new Date().toISOString() });
    active = render();
    await settle();
    await sendFromWhat(active);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockCreateOrder.mock.calls[0][0].idempotencyKey).not.toBe(STALE_SENT_ID);
  });

  it("Send again keeps a stored, still-unanswered key (and doesn't overwrite it)", async () => {
    mockSecureStore[DRAFT] = storedDraft({ sentKey: LIVE_SENT_ID, sentAt: Date.now() - 60_000 });
    mockParams = SEND_AGAIN();
    mockCreateOrder.mockReturnValueOnce(new Promise(() => {}));
    active = render();
    await settle();
    await settle(600);
    expect(stored().sentKey).toBe(LIVE_SENT_ID);
    await sendFromWhat(active);
    expect(mockCreateOrder.mock.calls[0][0].idempotencyKey).toBe(LIVE_SENT_ID);
  });
});

describe("send.tsx — pickup prefilled from the customer's current location", () => {
  beforeEach(() => grantLocation());

  it("drops the pickup pin, names it and marks it Your location, with nothing tapped", async () => {
    active = render();
    await settle();
    await settle();
    expect(has(active, "My Current Spot")).toBe(true);
    expect(has(active, " · Your location")).toBe(true);
  });

  it("never re-writes a pickup the customer placed themselves", async () => {
    let resolveFix: (f: Fix) => void = () => {};
    mockCurrent.mockImplementation(() => new Promise<Fix>((r) => (resolveFix = r)));
    active = render();
    await settle();
    pressTestId(active, "test-set-pickup");
    await act(async () => {
      resolveFix({ coords: { latitude: -17.9, longitude: 31.1 } });
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    expect(has(active, "Test Pickup Spot")).toBe(true);
    expect(has(active, "My Current Spot")).toBe(false);
  });

  it("stays silent when location is unavailable", async () => {
    mockGetPerm.mockImplementation(async () => DENIED);
    active = render();
    await settle();
    expect(mockRequestPerm).not.toHaveBeenCalled();
    expect(has(active, "Set pickup location")).toBe(true);
    expect(has(active, "Couldn't get your location")).toBe(false);
  });
});
