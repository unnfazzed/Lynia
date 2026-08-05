/**
 * LC-C06 (customer order journey audit — create step): the compose screen persists a PII-free draft
 * (debounced 500ms after the last field edit) whose `idempotencyNonce`, combined with the live field
 * values, derives the create-order idempotency key the server dedupes on. Before this fix, `submit()`
 * fired the request straight off in-memory state WITHOUT flushing that debounced write first — so an
 * edit made just before tapping "Send to riders" could still be sitting in the pending debounce timer
 * when the request went out. If the app was then killed before the timer fired (well within the 15s
 * request timeout), the on-disk draft reflected the PRE-edit content. A manual resubmit after relaunch
 * would recompute a DIFFERENT idempotencyKey than the one actually sent (same nonce, different content
 * hash), missing the server's dedup and opening a second live auction for what the customer intended as
 * one order.
 *
 * This test drives the real `send.tsx` screen (mocking only the native-map/API/storage edges, per the
 * pattern in `food/order/__tests__/order-screen.test.tsx` and `(tabs)/__tests__/home.test.tsx`) and
 * asserts that by the time `createOrder` fires, the mocked SecureStore has ALREADY been written with a
 * draft matching the exact price in the request — i.e. the flush happens synchronously as part of
 * submit(), not on some later debounce tick that a kill right after send would never see.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { PickedPoint } from "../../src/ui/MapPicker";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

// Inside the launch corridor (SERVICE_CORRIDOR, packages/shared/src/policy.ts): pickup at the exact
// center, drop-off a short distance away, both well within the 25km radius.
const PICKUP: PickedPoint = { lat: -17.8292, lng: 31.0522 };
const DROPOFF: PickedPoint = { lat: -17.82, lng: 31.06 };

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

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
      ),
  };
});
jest.mock("../../src/ui/AddressSearch", () => ({
  AddressSearch: () => {
    const React_ = require("react");
    const { Text } = require("react-native");
    return React_.createElement(Text, null, "AddressSearch");
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
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  secureStore = {};
  jest.clearAllMocks();
});

describe("send.tsx — account-on-hold wall (RF-21 characterization, pre-extraction)", () => {
  it("shows the on-hold copy + support call row, and refresh calls the me query's refetch", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Your account is on hold").length).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (n) => n.props.children === "We've paused your account while we review recent activity. You can't send parcels right now — contact support if you think this is a mistake.",
      ).length,
    ).toBeGreaterThan(0);
    // SupportCallRow's phone-call affordance
    expect(tree.root.findAll((n) => n.props.children === "LyniaGo support").length).toBeGreaterThan(0);

    mockGetMe.mockClear();
    pressByText(tree, "Refresh status");
    await settle();
    expect(mockGetMe).toHaveBeenCalled();
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

  it("shows the active-order check failure banner (with retry) when held, the query errors, and a persisted hint says an order may be in flight", async () => {
    secureStore["lynia.activeOrderHint"] = "order-1";
    mockGetActiveCustomerOrder.mockRejectedValue(new Error("network down"));
    mockGetMe.mockResolvedValue({ onHold: true });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => n.props.children === "Couldn't check for an active order").length).toBeGreaterThan(0);

    mockGetActiveCustomerOrder.mockClear();
    pressByText(tree, "Retry");
    await settle();
    expect(mockGetActiveCustomerOrder).toHaveBeenCalled();
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

    setFieldByAccessibilityLabel(tree, "Pickup contact phone", "abcdef");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "abcdef");
    // react-test-renderer's tree walk visits both the composite Text instance and its underlying host
    // node for the same error caption, so a raw count double-counts (see SendItemsList's equivalent
    // note) — presence is what matters here, not an exact count.
    expect(tree.root.findAll((n) => n.props.children === "That doesn't look like a phone number").length).toBeGreaterThan(0);

    setFieldByAccessibilityLabel(tree, "Pickup contact phone", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    expect(tree.root.findAll((n) => n.props.children === "That doesn't look like a phone number").length).toBe(0);
  });
});

describe("send.tsx — Price/quote block (RF-21 characterization, pre-extraction)", () => {
  it("shows no suggested-fare preview until both pins are set, then shows it with the acceptance-band hint, and 'Use suggested' fills the price", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    expect(tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.join("").startsWith("Suggested fare $")).length).toBe(0);

    // PICKUP/DROPOFF (both inside the launch corridor) quote to a fixed $2.29 over 1.31 km — pinned
    // constants of packages/shared's quoteFare, not re-derived here.
    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");

    expect(
      tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.join("") === "Suggested fare $2.29 · 1.31 km").length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.children === "Riders usually accept around $1.90–$2.70").length).toBeGreaterThan(0);

    pressByText(tree, "Use suggested $2.29");
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Your price (USD)" && n.props.value === "2.29").length).toBeGreaterThan(0);
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

describe("send.tsx — draft flush before submit (LC-C06)", () => {
  it("persists the on-disk draft with the submitted price BEFORE the create-order request fires, even mid-debounce", async () => {
    mockGetActiveCustomerOrder.mockResolvedValue(null);
    mockGetMe.mockResolvedValue({ onHold: false });
    // createOrder never resolves in this test — standing in for "the app could be killed at any moment
    // after this, before any response is processed," the exact adversarial window the fix targets.
    mockCreateOrder.mockReturnValue(new Promise(() => {}));

    activeTree = renderSend();
    await settle();
    const tree = activeTree!;

    pressTestId(tree, "test-set-pickup");
    pressTestId(tree, "test-set-drop");
    setFieldByAccessibilityLabel(tree, "Pickup contact phone", "0771234567");
    setFieldByAccessibilityLabel(tree, "Recipient phone", "0779876543");
    setFieldByAccessibilityLabel(tree, "Documents", "A parcel");
    // The price edit that lands INSIDE the 500ms debounce window — the draft on disk at this point
    // still reflects whatever (or nothing) was there before this keystroke.
    setFieldByAccessibilityLabel(tree, "Your price (USD)", "7.50");

    // Confirm the pre-fix assumption: the debounced write has NOT landed yet (it's still pending on
    // its 500ms timer) at the moment we're about to tap Send — this is what makes the window real.
    expect(secureStore["lynia.orderDraft"]).toBeUndefined();

    pressByText(tree, "Send to riders");
    await settle();

    // createOrder was actually called (canSubmit gated it correctly) …
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const submittedPrice = mockCreateOrder.mock.calls[0]?.[0]?.proposedFare;
    expect(submittedPrice).toBe(7.5);

    // … and by now (before createOrder's never-resolving promise has settled) the on-disk draft has
    // ALREADY been flushed with that same price — not left at whatever the 500ms debounce last wrote,
    // and not still pending in the timer for an app-kill to lose.
    expect(mockSetItemAsync).toHaveBeenCalled();
    const persisted = JSON.parse(secureStore["lynia.orderDraft"] ?? "null");
    expect(persisted).not.toBeNull();
    expect(persisted.proposedFare).toBe("7.50");
  });
});
