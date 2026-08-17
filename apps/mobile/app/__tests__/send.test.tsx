/**
 * send.tsx compose-screen tests. The send flow keeps NO on-device draft: attempting to send a parcel
 * and relaunching starts afresh on a blank form (there is no "Draft restored" chip and nothing is
 * stashed under the old `lynia.orderDraft` key). These tests drive the real screen (mocking only the
 * native-map/API/storage edges, per the pattern in `food/order/__tests__/order-screen.test.tsx` and
 * `(tabs)/__tests__/home.test.tsx`) and cover the on-hold wall, the compose/submit path, and the
 * no-draft guarantee.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PickedPoint } from "../../src/ui/MapPicker";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

// Inside the launch corridor (SERVICE_CORRIDOR, packages/shared/src/policy.ts): pickup at the exact
// center, drop-off a short distance away, both well within the 25km radius.
const PICKUP: PickedPoint = { lat: -17.8292, lng: 31.0522 };
const DROPOFF: PickedPoint = { lat: -17.82, lng: 31.06 };
// A farther drop-off, still inside the corridor — a longer leg, so it quotes a HIGHER fare than DROPOFF.
const DROPOFF_FAR: PickedPoint = { lat: -17.75, lng: 31.12 };

const mockCreateOrder = jest.fn();
const mockGetActiveCustomerOrder = jest.fn();
const mockGetMe = jest.fn();
const mockLoadRecipients = jest.fn(async () => [] as { name: string; phone: string }[]);

let secureStore: Record<string, string> = {};
const mockSetItemAsync = jest.fn(async (key: string, value: string) => {
  secureStore[key] = value;
});
const mockGetItemAsync = jest.fn(async (key: string) => secureStore[key] ?? null);
const mockDeleteItemAsync = jest.fn(async (key: string) => {
  delete secureStore[key];
});

const mockBack = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
// The `rb…` re-broadcast route params, when a test is exercising the "send this order again" entry.
// Empty for a plain /send open (the overwhelmingly common case).
let mockRebroadcastParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: (...args: [string]) => mockReplace(...args),
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockRebroadcastParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
}));
jest.mock("../../src/api/auth", () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));
// The on-hold wall restores the mock's "Sign out" ghost button (ledger D-19), so this screen now
// reaches auth context. Same shape the settings/profile screen tests use.
jest.mock("../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: mockSignOut }),
}));
jest.mock("../../src/api/orders", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getActiveCustomerOrder: (...args: unknown[]) => mockGetActiveCustomerOrder(...args),
}));
jest.mock("../../src/auth/session", () => ({
  loadDisclaimerAccepted: async () => "2026-07-01",
  saveDisclaimerAccepted: async () => undefined,
}));
jest.mock("../../src/logic/saved-recipients", () => ({
  loadRecipients: () => mockLoadRecipients(),
  loadMyPickupPhone: async () => "",
  rememberRecipient: async () => undefined,
  saveMyPickupPhone: async () => undefined,
}));
// ComposeMap/AddressSearch mount react-native-maps/expo-location — stubbed the same way the other
// order-screen tests stub LiveTrackingCard, so this test exercises the SCREEN's submit logic, not the
// map widget. The stub exposes the real onChangePickup/onChangeDrop/onReverseGeocode* callbacks behind
// plain testID Pressables so the test can "drop a pin" without a real map.
jest.mock("../../src/ui/ComposeMap", () => {
  const React_ = require("react");
  const { Pressable } = require("react-native");
  return {
    ComposeMap: (props: {
      onChangePickup: (p: PickedPoint) => void;
      onChangeDrop: (p: PickedPoint) => void;
      onReverseGeocodePickup?: (l: string) => void;
      onReverseGeocodeDrop?: (l: string) => void;
    }) =>
      React_.createElement(
        React_.Fragment,
        null,
        React_.createElement(Pressable, {
          testID: "test-set-pickup",
          onPress: () => {
            props.onChangePickup(PICKUP);
            props.onReverseGeocodePickup?.("Test Pickup Landmark");
          },
        }),
        React_.createElement(Pressable, {
          testID: "test-set-drop",
          onPress: () => {
            props.onChangeDrop(DROPOFF);
            props.onReverseGeocodeDrop?.("Test Drop Landmark");
          },
        }),
        // A SECOND, farther drop-off — a longer leg quotes a different fare, which is what the D-31
        // re-suggest rule keys on (moving a pin to a point that prices the same would prove nothing).
        React_.createElement(Pressable, {
          testID: "test-set-drop-far",
          onPress: () => {
            props.onChangeDrop(DROPOFF_FAR);
            props.onReverseGeocodeDrop?.("Far Drop Landmark");
          },
        }),
      ),
  };
});
// The pickup auto-locate (usePickupAutolocate) runs FOR REAL on this screen — it is the behaviour the
// last describe block is about — so the native location edge beneath it is stubbed here rather than the
// hook itself.
//
// The default is a phone with NO location to give (hard-denied, so the hook doesn't even prompt),
// because that is the device state every OTHER test in this file was written against: an empty
// composer with both landmarks blank. The auto-locate block opts into a located phone explicitly via
// `grantLocation()`. Making it the other way round would quietly re-point the characterization tests
// at a screen that already has a pickup pin, which is not what any of them are checking.
type LocationPermission = { granted: boolean; canAskAgain: boolean; status: string };
type Fix = { coords: { latitude: number; longitude: number } } | null;
const DENIED: LocationPermission = { granted: false, canAskAgain: false, status: "denied" };
const GRANTED: LocationPermission = { granted: true, canAskAgain: true, status: "granted" };
const mockGetForegroundPermissionsAsync = jest.fn(async (): Promise<LocationPermission> => DENIED);
const mockRequestForegroundPermissionsAsync = jest.fn(async (): Promise<LocationPermission> => GRANTED);
const mockGetLastKnownPositionAsync = jest.fn(async (): Promise<Fix> => null);
const mockGetCurrentPositionAsync = jest.fn(async (): Promise<Fix> => null);
const mockReverseGeocodeAsync = jest.fn(async () => [] as { name: string | null; street: string | null; district: string | null }[]);
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: () => mockGetForegroundPermissionsAsync(),
  requestForegroundPermissionsAsync: () => mockRequestForegroundPermissionsAsync(),
  getLastKnownPositionAsync: () => mockGetLastKnownPositionAsync(),
  getCurrentPositionAsync: () => mockGetCurrentPositionAsync(),
  reverseGeocodeAsync: () => mockReverseGeocodeAsync(),
}));

/** A phone standing at PICKUP with location granted and a geocoder that can name the spot. */
function grantLocation(): void {
  mockGetForegroundPermissionsAsync.mockImplementation(async () => GRANTED);
  mockGetCurrentPositionAsync.mockImplementation(async () => ({ coords: { latitude: PICKUP.lat, longitude: PICKUP.lng } }));
  mockReverseGeocodeAsync.mockImplementation(async () => [{ name: "My Current Spot", street: null, district: "Harare CBD" }]);
}
// The stub echoes `prefill` back through a testID so the SCREEN's half of D-31 (does send.tsx hand the
// active slot's address to the search field?) is assertable here. The field's own half — seeding the
// text, and not fighting what the customer types — is covered in src/ui/__tests__/address-search.test.tsx.
jest.mock("../../src/ui/AddressSearch", () => ({
  AddressSearch: (props: { label: string; prefill?: string }) => {
    const React_ = require("react");
    const { Text } = require("react-native");
    return React_.createElement(Text, { testID: `address-search-prefill-${props.label}` }, props.prefill ?? "");
  },
}));

import HomeScreen from "../send";

function pressTestId(tree: renderer.ReactTestRenderer, testID: string): void {
  const node = tree.root.findByProps({ testID });
  act(() => node.props.onPress());
}

/** Find a Pressable ancestor of a Text node whose children match `label`, and press it — the pattern
 *  `food/order/__tests__/order-screen.test.tsx` uses, since Button/plain Pressables here don't set an
 *  accessibilityLabel of their own. */
function pressByText(tree: renderer.ReactTestRenderer, label: string): void {
  const match = (v: unknown): boolean => v === label;
  const node = tree.root.findAll((n) => match(n.props.children))[0];
  if (!node) throw new Error(`no node labelled ${label}`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable ancestor for ${label}`);
  act(() => p!.props.onPress());
}

/** Fields are located by the accessibilityLabel `Field` derives from `label` (or `placeholder` when
 *  there's no label) — see src/ui/index.tsx's Field component. */
function setFieldByAccessibilityLabel(tree: renderer.ReactTestRenderer, accessibilityLabel: string, value: string): void {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === accessibilityLabel && typeof n.props.onChangeText === "function")[0];
  if (!node) throw new Error(`no field found for ${accessibilityLabel}`);
  act(() => node.props.onChangeText(value));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderSend(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <HomeScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

let activeTree: renderer.ReactTestRenderer | null = null;
// `jest.clearAllMocks()` below clears CALLS but keeps implementations, so a `grantLocation()` (or any
// per-test override) would otherwise leak into the next test. Restore the no-location device here.
beforeEach(() => {
  mockGetForegroundPermissionsAsync.mockImplementation(async () => DENIED);
  mockRequestForegroundPermissionsAsync.mockImplementation(async () => GRANTED);
  mockGetLastKnownPositionAsync.mockImplementation(async () => null);
  mockGetCurrentPositionAsync.mockImplementation(async () => null);
  mockReverseGeocodeAsync.mockImplementation(async () => []);
});
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  secureStore = {};
  mockCanGoBack = true;
  mockRebroadcastParams = {};
  jest.clearAllMocks();
});

describe("send.tsx — account-on-hold wall (RF-21 characterization, pre-extraction)", () => {
  it("shows the on-hold copy + support call row, and offers NO manual refresh (the wall self-updates)", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Your account is on hold").length).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        // The mock's wording (screens.jsx `OnHold`, LJ.on_hold), verbatim.
        (n) => n.props.children === "We've paused your account while we review recent activity. This usually takes 24 hours — call us if you think it's a mistake.",
      ).length,
    ).toBeGreaterThan(0);
    // SupportCallRow's phone-call affordance
    expect(tree.root.findAll((n) => n.props.children === "LyniaGo support").length).toBeGreaterThan(0);

    // Owner instruction (2026-08-16): no manual refreshing anywhere — the wall must carry no "Refresh
    // status" button. A lift is an ops action, so the screen notices it on its own (the ["me"] poll that
    // runs only while held, plus the app-foreground invalidate in send.tsx), not on a tap the customer
    // has to remember. Asserting the ABSENCE is the point: this is what the removal must not regress.
    expect(tree.root.findAll((n) => n.props.children === "Refresh status")).toHaveLength(0);
  });

  // Ledger D-21: the wall keeps a plain back too. A hold gates ONE screen (send.tsx is the only
  // accountOnHold check) and the server blocks only NEW orders, so the rest of the app still works for
  // a held customer — signing out to reach their own order history was the wrong price.
  it("offers a plain Back that pops, so a hold does not cost the customer their session", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    const back = tree.root.findAll((n) => n.props.accessibilityLabel === "Back" && typeof n.props.onPress === "function");
    expect(back.length).toBeGreaterThan(0);
    await act(async () => {
      back[0]!.props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("falls back to the launcher from the hold wall when there is no stack to pop", async () => {
    mockCanGoBack = false;
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    const back = tree.root.findAll((n) => n.props.accessibilityLabel === "Back" && typeof n.props.onPress === "function");
    await act(async () => {
      back[0]!.props.onPress();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  // Ledger D-19: the kit's OnHold draws a "Sign out" ghost button the app had dropped, which left the
  // wall with a phone number as its only interactive control — no tab bar (/send is pushed), no back
  // puck (this branch returns before the map top bar), and no manual refresh since 2026-08-16.
  it("offers the mock's Sign out, the wall's only way off a held account", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressByText(tree, "Sign out");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("shows the active-order restore banner instead of the on-hold wall's own default, when a live order exists while held", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue({
      id: "order-1",
      status: "en_route_pickup",
      agreedFare: "8.00",
      proposedFare: "7.50",
      pickup: { point: PICKUP, landmark: "Pickup Spot" },
      dropoff: { point: DROPOFF, landmark: "Drop Spot" },
    });
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(
      tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children[0] === "Delivery in progress · ").length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (n) => Array.isArray(n.props.children) && n.props.children.join("") === "Pickup Spot → Drop Spot · $8.00",
      ).length,
    ).toBeGreaterThan(0);
    // Still on the on-hold wall underneath the banner, not the compose form.
    expect(tree.root.findAll((n) => n.props.children === "Your account is on hold").length).toBeGreaterThan(0);
  });

  // Owner instruction 2026-08-12: a background poll the customer never triggered must NOT raise an
  // error card — not over the compose home, and not over the on-hold wall. This used to be
  // evidence-gated (UX-2026-08-05); now it never renders, so a leftover hint from a pre-removal build
  // can't resurrect it. The on-hold wall itself is unaffected.
  it("raises no active-order check banner when held and the query errors, even with a leftover hint", async () => {
    secureStore["lynia.activeOrderHint"] = "order-1";
    mockGetActiveCustomerOrder.mockRejectedValue(new Error("network down"));
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Couldn't check for an active order").length).toBe(0);
    // The wall the customer actually needs is still there.
    expect(tree.root.findAll((n) => n.props.children === "Your account is on hold").length).toBeGreaterThan(0);
  });

  // UX-2026-08-05: with no local evidence of an order in flight, the failed background check stays
  // quiet — no permanent danger banner over the on-hold wall (or the compose home, same gate).
  it("does NOT show the check failure banner when the query errors but no order hint is persisted", async () => {
    mockGetActiveCustomerOrder.mockRejectedValue(new Error("network down"));
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();

    expect(activeTree!.root.findAll((n) => n.props.children === "Couldn't check for an active order").length).toBe(0);
  });
});

describe("send.tsx — Landmarks & details collapsible (RF-21 characterization, pre-extraction)", () => {
  it("starts collapsed with a required-fields summary, and the toggle expands/collapses the panel", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    // Empty pickup/drop landmarks fail landmarksOk — the collapsed header surfaces that inline.
    const header = tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Landmarks and details"))[0]!;
    expect(header).toBeTruthy();
    expect(header.props.accessibilityLabel).toBe("Landmarks and details, landmarks required");
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(tree.root.findAll((n) => n.props.value === "Pickup landmark").length).toBe(0);

    act(() => header.props.onPress());
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Pickup landmark").length).toBeGreaterThan(0);

    const headerAfterOpen = tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Landmarks and details"))[0]!;
    expect(headerAfterOpen.props.accessibilityState).toEqual({ expanded: true });

    act(() => headerAfterOpen.props.onPress());
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Pickup landmark").length).toBe(0);
  });

  it("labels a reverse-geocoded landmark 'from map' until the user edits it, then drops the label", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup"); // fires onReverseGeocodePickup("Test Pickup Landmark")

    const header = tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Landmarks and details"))[0]!;
    act(() => header.props.onPress());

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Pickup landmark  • from map" && n.props.value === "Test Pickup Landmark").length).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Pickup landmark  • from map", "Hand-typed landmark");

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Pickup landmark" && n.props.value === "Hand-typed landmark").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.includes("from map")).length).toBe(0);
  });

  it("flags a declared value outside $0–150 inline, and clears the flag back in range", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    const header = tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Landmarks and details"))[0]!;
    act(() => header.props.onPress());

    setFieldByAccessibilityLabel(tree, "Declared value (USD, max 150)", "200");
    expect(tree.root.findAll((n) => n.props.children === "Declared value must be between $0 and $150.").length).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Declared value (USD, max 150)", "50");
    expect(tree.root.findAll((n) => n.props.children === "Declared value must be between $0 and $150.").length).toBe(0);
  });
});

describe("send.tsx — Items list (RF-21 characterization, pre-extraction)", () => {
  /** The Remove button has no accessibilityRole="button"-only lookup helper in this file (pressByText
   *  matches on the visible "Remove" label, which is shared by every row) — find it by its per-row
   *  accessibilityLabel instead. */
  function pressByAccessibilityLabel(tree: renderer.ReactTestRenderer, accessibilityLabel: string): void {
    const node = tree.root.findAll((n) => n.props.accessibilityLabel === accessibilityLabel && typeof n.props.onPress === "function")[0];
    if (!node) throw new Error(`no pressable found for ${accessibilityLabel}`);
    act(() => node.props.onPress());
  }

  it("starts with a single item row (no Remove affordance); adding a row reveals Remove on both", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Documents" && typeof n.props.onChangeText === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Remove item")).length).toBe(0);

    pressByText(tree, "Add another item");

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Documents" && typeof n.props.onChangeText === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Another item" && typeof n.props.onChangeText === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Remove item 1" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Remove item 2" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
  });

  it("removing a row deletes it, and the last remaining row loses its Remove affordance again", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressByText(tree, "Add another item");
    setFieldByAccessibilityLabel(tree, "Another item", "A second parcel");
    pressByAccessibilityLabel(tree, "Remove item 2");

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Another item" && typeof n.props.onChangeText === "function").length).toBe(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Documents" && typeof n.props.onChangeText === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Remove item")).length).toBe(0);
  });

  it("hides 'Add another item' past MAX_ITEMS (10) rows and shows the cap notice instead", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Up to 10 items per order.").length).toBe(0);
    for (let i = 1; i < 10; i++) pressByText(tree, "Add another item");

    // Precisely 10 rows: the 10th row's Remove affordance exists, an 11th does not.
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Remove item 10" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Remove item 11").length).toBe(0);
    expect(tree.root.findAll((n) => n.props.children === "Add another item").length).toBe(0);
    expect(tree.root.findAll((n) => n.props.children === "Up to 10 items per order.").length).toBeGreaterThan(0);
  });
});

describe("send.tsx — Recipient-phone block (RF-21 characterization, pre-extraction)", () => {
  it("shows a quick-fill chip per saved recipient when the recipient phone is empty, and tapping one fills the field", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
    mockLoadRecipients.mockResolvedValue([{ name: "Tino", phone: "0779876543" }, { name: "", phone: "0771112222" }]);

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Use recipient Tino" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Use recipient 0771112222" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);

    pressByText(tree, "Tino · 0779876543");

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Recipient phone" && n.props.value === "0779876543").length).toBeGreaterThan(0);
  });

  it("hides the quick-fill chips once the recipient phone field has any text, even with saved recipients loaded", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
    mockLoadRecipients.mockResolvedValue([{ name: "Tino", phone: "0779876543" }]);

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Use recipient Tino").length).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Recipient phone", "0");

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Use recipient Tino").length).toBe(0);
  });

  it("flags an unparseable pickup/recipient phone inline, and clears the flag once the number is valid", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    setFieldByAccessibilityLabel(tree, "Your phone (sender)", "abcdef");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "abcdef");
    // react-test-renderer's tree walk visits both the composite Text instance and its underlying host
    // node for the same error caption, so a raw count double-counts (see SendItemsList's equivalent
    // note) — presence is what matters here, not an exact count.
    expect(tree.root.findAll((n) => n.props.children === "That doesn't look like a phone number").length).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Your phone (sender)", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    expect(tree.root.findAll((n) => n.props.children === "That doesn't look like a phone number").length).toBe(0);
  });
});

describe("send.tsx — Price/quote block (RF-21 characterization, pre-extraction)", () => {
  // D-31 (owner instruction 2026-08-17): the suggestion reaches the price field by autofill, so the two
  // things that used to carry it — the "Suggested fare $X · Y km" line and the "Use suggested $X" button
  // — are gone. The acceptance band stays.
  it("shows nothing until both pins are set, then fills the price with the suggestion and shows only the acceptance band", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)" && n.props.value === "").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.startsWith("Riders usually accept")).length).toBe(0);

    // PICKUP/DROPOFF (both inside the launch corridor) quote to a fixed $2.29 over 1.31 km — pinned
    // constants of packages/shared's quoteFare, not re-derived here.
    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");

    // The suggestion lands in the field itself, with no button press …
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)" && n.props.value === "2.29").length).toBeGreaterThan(0);
    // … the band hint stays, at its drawn 12px …
    const band = tree.root.findAll((n) => n.props.children === "Riders usually accept around $1.90–$2.70");
    expect(band.length).toBeGreaterThan(0);
    expect(band[0]?.props.style?.fontSize).toBe(12);
    // … and neither retired affordance is on screen.
    expect(tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.join("").startsWith("Suggested fare $")).length).toBe(0);
    expect(tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.startsWith("Use suggested")).length).toBe(0);
  });

  // The owner's call when asked (2026-08-17): re-suggest always, over keep-what-you-typed. A price the
  // customer typed survives everything EXCEPT the trip changing under it.
  it("re-suggests over a typed price when a pin moves, but never while the trip stays put", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "6.00");
    // Editing other fields leaves the typed price alone …
    setFieldByAccessibilityLabel(tree, "Documents", "A parcel");
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)" && n.props.value === "6.00").length).toBeGreaterThan(0);

    // … but moving the drop pin is a new trip, so it earns the new suggestion. ELSEWHERE is a longer
    // leg than DROPOFF, so the fare genuinely changes rather than re-writing the same number.
    act(() => {
      tree.root.findByProps({ testID: "test-set-drop-far" }).props.onPress();
    });
    const priced = tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)");
    expect(priced[0]?.props.value).not.toBe("6.00");
    expect(Number(priced[0]?.props.value)).toBeGreaterThan(2.29);
  });

  it("nudges a below-band price and clears the nudge once the price is back in band", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");

    // Band is $1.90–$2.70 for this quote (see the test above); $1.00 sits below the low edge.
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "1.00");
    expect(
      tree.root.findAll((n) => n.props.children === "That's below what riders usually take — they may pass. Nudge it up for a faster match.").length,
    ).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Your price (USD)", "2.29");
    expect(
      tree.root.findAll((n) => n.props.children === "That's below what riders usually take — they may pass. Nudge it up for a faster match.").length,
    ).toBe(0);
  });

  it("nudges a far-above-band price (possible fat-finger) and clears the nudge back in a normal range", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");

    // Band high edge is $2.70; the far-above-band guard fires past 3x that ($8.10) — $10 clears it.
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "10");
    expect(
      tree.root.findAll((n) => n.props.children === "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.").length,
    ).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Your price (USD)", "2.29");
    expect(
      tree.root.findAll((n) => n.props.children === "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake.").length,
    ).toBe(0);
  });
});

describe("send.tsx — map-anchored top bar (pixel parity: single action)", () => {
  it("floats a single round action (Account) over the map — the kit draws no second (Notifications) button", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    // The account avatar is present…
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Account" && typeof n.props.onPress === "function").length).toBeGreaterThan(0);
    // …and the old top-bar Notifications round button is gone (notifications live on the Account tab).
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Notifications").length).toBe(0);
  });

  // /send is pushed over the tab shell, which hides the tab bar — without this puck the composer has no
  // exit at all (owner report 2026-08-16, ledger D-14).
  it("floats a round Back puck that pops the stack", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    const back = tree.root.findAll((n) => n.props.accessibilityLabel === "Back" && typeof n.props.onPress === "function");
    expect(back.length).toBeGreaterThan(0);
    await act(async () => {
      back[0]!.props.onPress();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("lands on the launcher instead of popping when /send is the first route (deep link / cold start)", async () => {
    mockCanGoBack = false;
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    const back = tree.root.findAll((n) => n.props.accessibilityLabel === "Back" && typeof n.props.onPress === "function");
    await act(async () => {
      back[0]!.props.onPress();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("shows no invented 'Delivery details' heading — the sheet opens straight into the address rows and fields", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Delivery details").length).toBe(0);
    // The address rows are now inside the sheet (their PICKUP/DROP-OFF labels render).
    expect(tree.root.findAll((n) => n.props.children === "PICKUP").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.children === "DROP-OFF").length).toBeGreaterThan(0);
  });
});

describe("send.tsx — no on-device draft (start afresh)", () => {
  it("never writes a compose draft to storage while filling in the form", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
    // createOrder never resolves — the app could be killed at any moment after this; there must be no
    // stashed draft for a relaunch to restore.
    mockCreateOrder.mockReturnValue(new Promise(() => {}));

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");
    setFieldByAccessibilityLabel(tree, "Your phone (sender)", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    setFieldByAccessibilityLabel(tree, "Documents", "A parcel");
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "7.50");

    // Let any (hypothetical) debounce window elapse.
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(secureStore["lynia.orderDraft"]).toBeUndefined();

    pressByText(tree, "Proceed");
    await settle();

    // The order still fired with the typed values (draft removal doesn't touch submit) …
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockCreateOrder.mock.calls[0]?.[0]?.proposedFare).toBe(7.5);
    // … and nothing was ever persisted under the old draft key.
    expect(secureStore["lynia.orderDraft"]).toBeUndefined();
  });

  it("opens a blank form on a fresh mount even if a legacy draft is still in storage", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
    // A draft left behind by an older app version must be ignored, not restored.
    secureStore["lynia.orderDraft"] = JSON.stringify({
      pickupPoint: PICKUP,
      pickupLandmark: "Old Pickup",
      dropPoint: DROPOFF,
      dropLandmark: "Old Drop",
      items: [{ description: "Old parcel", quantity: 1 }],
      note: "",
      declaredValue: "",
      proposedFare: "9.99",
    });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    // None of the stale draft's content is on screen, and there's no "Draft restored" chip.
    expect(tree.root.findAll((n) => n.props.children === "Draft restored").length).toBe(0);
    expect(tree.root.findAll((n) => n.props.value === "Old Pickup").length).toBe(0);
    expect(tree.root.findAll((n) => n.props.value === "9.99").length).toBe(0);
  });
});

describe("send.tsx — pickup prefilled from the customer's current location", () => {
  beforeEach(() => {
    grantLocation();
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
  });

  /** The price field's current text — empty until both pins are set, then the autofilled suggestion. */
  function priceValue(tree: renderer.ReactTestRenderer): string {
    const node = tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)")[0];
    if (!node) throw new Error("no price field on screen");
    return node.props.value as string;
  }

  // Owner instruction 2026-08-17: "on pickup, it must automatically prefill the pickup location with
  // your current location. You can edit but it must be prefilled when you open the tab."
  it("drops the pickup pin and names it, with nothing tapped", async () => {
    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    // The pickup address row carries the reverse-geocoded name (AddressRows renders the landmark) …
    expect(tree.root.findAll((n) => n.props.children === "My Current Spot, Harare CBD").length).toBeGreaterThan(0);
    // … and the pin itself is really set. Since D-31 took the missing-requirements hint off the screen,
    // the proof is the quote: a fare needs BOTH pins, so a price appearing on the drop-off tap alone
    // could not have happened if the customer still owed a pickup pin.
    expect(priceValue(tree)).toBe("");
    pressTestId(tree, "test-set-drop");
    expect(Number(priceValue(tree))).toBeGreaterThan(0);
  });

  // D-31 also feeds the search field the slot's address — the auto-located pickup must reach it, or the
  // box under a filled PICKUP row reads as the drop-off's empty box (the report that prompted the fix).
  it("carries the auto-located pickup into the pickup search field", async () => {
    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findByProps({ testID: "address-search-prefill-Pickup" }).props.children).toBe("My Current Spot, Harare CBD");
  });

  it("submits the auto-located pickup when the customer completes the rest of the form", async () => {
    mockCreateOrder.mockResolvedValue({ id: "order-9", status: "auction", proposedFare: "7.50", expiresAt: null });
    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-drop");
    setFieldByAccessibilityLabel(tree, "Your phone (sender)", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    setFieldByAccessibilityLabel(tree, "Documents", "A parcel");
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "7.50");
    pressByText(tree, "Proceed");
    await settle();

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockCreateOrder.mock.calls[0]?.[0]?.pickup).toEqual({
      point: { lat: PICKUP.lat, lng: PICKUP.lng },
      landmark: "My Current Spot, Harare CBD",
      contactPhone: "+263771234567",
    });
  });

  // "You can edit" — the prefill is a starting point, never a lock. A pin the customer places wins,
  // and the late GPS fix that lands after it must not drag their pin away.
  it("lets a customer-placed pickup pin override the prefill, and never re-writes it afterwards", async () => {
    const ELSEWHERE = { lat: -17.79, lng: 31.09 };
    let releaseFix: (v: { coords: { latitude: number; longitude: number } }) => void = () => {};
    mockGetCurrentPositionAsync.mockImplementation(
      () => new Promise((resolve) => (releaseFix = resolve)),
    );
    mockCreateOrder.mockResolvedValue({ id: "order-9", status: "auction", proposedFare: "7.50", expiresAt: null });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    // The customer drops their own pickup pin while the fix is still in flight …
    act(() => {
      tree.root.findByProps({ testID: "test-set-pickup" }).props.onPress();
    });
    // … and only then does the GPS answer.
    await act(async () => {
      releaseFix({ coords: { latitude: ELSEWHERE.lat, longitude: ELSEWHERE.lng } });
    });
    await settle();

    pressTestId(tree, "test-set-drop");
    setFieldByAccessibilityLabel(tree, "Your phone (sender)", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    setFieldByAccessibilityLabel(tree, "Documents", "A parcel");
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "7.50");
    pressByText(tree, "Proceed");
    await settle();

    expect(mockCreateOrder.mock.calls[0]?.[0]?.pickup.point).toEqual({ lat: PICKUP.lat, lng: PICKUP.lng });
    expect(mockCreateOrder.mock.calls[0]?.[0]?.pickup.landmark).toBe("Test Pickup Landmark");
  });

  // Nobody asked for this fix, so a refused permission must leave the composer exactly as the mock's
  // `home_empty` draws it — the tap-the-map path, no error card, no toast.
  it("leaves the composer untouched and silent when location is unavailable", async () => {
    mockGetForegroundPermissionsAsync.mockImplementation(async () => DENIED);

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
    // Still the mock's `home_empty`: the pickup row shows its placeholder, no pin was set (so nothing
    // priced the trip), and no error was raised for a fix nobody asked for.
    expect(tree.root.findAll((n) => n.props.children === "Set pickup location").length).toBeGreaterThan(0);
    expect(priceValue(tree)).toBe("");
    expect(tree.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes("Couldn't get your location")).length).toBe(0);
  });

  // A re-broadcast is "send THIS order again": its pickup is the whole point, so the device's current
  // position must not overwrite it — the customer is often nowhere near the original pickup.
  it("does not auto-locate over a re-broadcast's own pickup", async () => {
    mockRebroadcastParams = {
      rbPickupLat: "-17.8016",
      rbPickupLng: "31.0431",
      rbPickupLandmark: "Avondale Shops",
      rbDropLat: String(DROPOFF.lat),
      rbDropLng: String(DROPOFF.lng),
      rbDropLandmark: "Drop Spot",
      rbItems: JSON.stringify([{ description: "Documents envelope", quantity: 1 }]),
      rbFare: "4.50",
      rbNote: "",
    };

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(mockGetForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
    expect(tree.root.findAll((n) => n.props.children === "Avondale Shops").length).toBeGreaterThan(0);
    // Same reasoning for the PRICE (D-31): a re-broadcast arrives with both pins AND the original
    // order's fare, so the first suggestion computed for those pins must not overwrite the number the
    // customer is re-sending. Only a pin they move afterwards re-prices it.
    expect(priceValue(tree)).toBe("4.50");
  });
});
