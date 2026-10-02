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
const DROPOFF_OUT: PickedPoint = { lat: -18.3, lng: 31.3 };

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
  };
  const btn = (testID: string, onPress: () => void) => React_.createElement(Pressable, { key: testID, testID, onPress });
  return {
    ComposeMap: (props: MockMapProps) =>
      React_.createElement(
        React_.Fragment,
        null,
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
          props.onReverseGeocodeDrop?.("Chitungwiza Far");
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
import { ApiError } from "../../src/api/client";

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────

type Tree = renderer.ReactTestRenderer;

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => setTimeout(r, 0));
  });
}

function render(): Tree {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
afterEach(() => {
  if (active) act(() => active!.unmount());
  active = null;
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
    press(active, "Send to riders");
    await settle();
    expect(has(active, "Your account is on hold")).toBe(true);
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
    expect(has(active, "We don't cover that pickup or drop-off yet. We deliver across Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi.")).toBe(true);
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
    expect(has(t, "Note for the rider (optional)")).toBe(true);
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

  it("starts at the suggested fare with the band and Cash to your rider", async () => {
    const t = await atStep3();
    expect(priceText(t)).toBe(suggested.toFixed(2));
    expect(has(t, "Riders usually accept around $")).toBe(true);
    expect(has(t, "Cash to your rider")).toBe(true);
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
    expect(has(t, "That's below what riders usually take — they may pass. Nudge it up for a faster match.")).toBe(true);
    expect(isDisabled(t, "Review")).toBe(false);
    type(t, "Your price in US dollars", "99");
    expect(has(t, "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.")).toBe(true);
    expect(isDisabled(t, "Review")).toBe(false);
    type(t, "Your price in US dollars", "");
    expect(isDisabled(t, "Review")).toBe(true);
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
  async function atReview(): Promise<Tree> {
    active = render();
    await settle();
    completeWhere(active);
    type(active, "Item 1", "Documents envelope");
    type(active, "Note for the rider (optional)", "Blue gate. Ask for Rita.");
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
    expect(has(t, "Send to riders")).toBe(true);
    press(t, "Edit the price");
    expect(input(t, "Your price in US dollars")).toBeTruthy();
  });

  it("broadcasts straight to the auction — no disclaimer, address names as labels, declared value 0", async () => {
    mockCreateOrder.mockResolvedValue({ id: "o-1", status: "open_for_offers", proposedFare: 3.36, expiresAt: new Date().toISOString(), ridersNearby: 2 });
    const t = await atReview();
    press(t, "Send to riders");
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
    press(t, "Send to riders");
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

  it("returns to step 1 with the out-of-area notice when the server refuses the route", async () => {
    mockCreateOrder.mockRejectedValue(new ApiError(422, "Outside the service area", "out_of_area"));
    const t = await atReview();
    press(t, "Send to riders");
    await settle();
    expect(has(t, "Couldn't send. Check your data and try again.")).toBe(false);
    expect(has(t, "We don't cover that pickup or drop-off yet. We deliver across Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi.")).toBe(true);
    expect(isDisabled(t, "Next")).toBe(true);
  });

  it("offline: says so and keeps Send to riders disabled, while the steps stay usable", async () => {
    mockOnline = false;
    const t = await atReview();
    expect(has(t, "You're offline. What you've entered is saved.")).toBe(true);
    expect(has(t, "Connect to the internet to send.")).toBe(true);
    expect(isDisabled(t, "Send to riders")).toBe(true);
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

  it("never writes a compose draft to storage", async () => {
    mockCreateOrder.mockReturnValue(new Promise(() => {}));
    active = render();
    await settle();
    completeWhere(active);
    completeWhat(active);
    press(active, "Review");
    press(active, "Send to riders");
    await settle();
    expect(mockSecureStore["lynia.orderDraft"]).toBeUndefined();
    expect(mockSetItemAsync.mock.calls.filter(([k]) => k === "lynia.orderDraft")).toHaveLength(0);
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
