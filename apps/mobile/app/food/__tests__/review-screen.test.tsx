/**
 * Review & place — Order flow v2.1 R1–R9 (packages/design/handoff/order-flow-v2, ledger D-59): cart and
 * checkout as ONE screen. R1 blocks + pinned cash CTA, inline steppers, R3a/R3b inline address, R4 small-
 * order hint, R6a reconcile, R6b just closed, R7b failed toast, R7c offline, R9a empty, R9b no address,
 * and the exact place-order payload + the replace-into-the-order navigation.
 */
import { BackHandler, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";

jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { schedule?: string } = {};
// U24: the placing guard also blocks `beforeRemove`; the listeners are kept so a test can fire one.
const mockBeforeRemove: ((e: { preventDefault: () => void }) => void)[] = [];
const mockNavigation = {
  setOptions: () => undefined,
  addListener: (_event: string, cb: (e: { preventDefault: () => void }) => void) => {
    mockBeforeRemove.push(cb);
    return () => {
      const i = mockBeforeRemove.indexOf(cb);
      if (i >= 0) mockBeforeRemove.splice(i, 1);
    };
  },
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  // U41: a focused screen runs its focus effect like a plain effect.
  useFocusEffect: (cb: () => void | (() => void)) => require("react").useEffect(cb, [cb]),
  Redirect: () => null,
}));
let mockMe: { phone: string } | undefined;
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}), useQuery: () => ({ data: mockMe }) }));

const dish = (id: string, name: string, priceUsd: number, extra: object = {}) => ({ id, name, description: null, priceUsd, photoUrl: null, outOfStock: false, ...extra });
const mockMenu = {
  restaurant: {
    id: "m1",
    name: "Gava’s Kitchen",
    hours: null as unknown,
    location: { lat: -17.81, lng: 31.05 },
    ratingAvg: 4.7,
    ratingCount: 210,
    prepBaselineMinutes: 20,
    freeDelivery: false as boolean,
  },
  categories: [{ id: "c1", name: "Mains", dishes: [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6)] }],
};
const mockRefetch = jest.fn();
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantMenu: () => ({ menu: mockMenu, isLoading: false, isFetching: false, isError: false, refetch: mockRefetch }),
}));
let mockHome: { label: string; point: { lat: number; lng: number } | null; area: string | null } = { label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, area: "Belgravia" };
jest.mock("../../../src/logic/home-location", () => ({ useHomeLocation: () => ({ ...mockHome, source: "gps", locating: false, denied: false }) }));
let mockOnline = true;
jest.mock("../../../src/net/use-reachability", () => ({ useReachability: () => mockOnline }));
let mockSavedPhone: string | null = "0771234567";
jest.mock("../../../src/logic/saved-recipients", () => ({ loadMyPickupPhone: () => Promise.resolve(mockSavedPhone), saveMyPickupPhone: jest.fn(() => Promise.resolve()) }));
jest.mock("../../../src/push/ask-in-context", () => ({ routeAfterOrderPlaced: jest.fn(async (id: string) => `/order/${id}`) }));
jest.mock("../../../src/query/use-food-order", () => ({ seedFoodOrder: jest.fn() }));
jest.mock("../../../src/logic/use-address-suggest", () => ({ useAddressSuggest: () => ({ status: "idle", rows: [], limited: false }) }));
jest.mock("../../../src/ui/orderflow/PinMap", () => ({ PinMap: () => null }));
const mockPlace = jest.fn();
jest.mock("../../../src/api/food-orders", () => ({ placeFoodOrder: (...a: unknown[]) => mockPlace(...a) }));

const mockShop = {
  shop: { ...mockMenu.restaurant, id: "s1", name: "Avondale Fresh", shopKind: "grocery" },
  categories: [{ id: "c2", name: "Bakery", dishes: [dish("i1", "Bread (Lobels 700g)", 1.1), dish("i2", "Eggs (tray of 30)", 5.5)] }],
};
jest.mock("../../../src/query/use-shops", () => ({
  useShopCatalogue: () => ({ catalogue: mockShop, isLoading: false, isFetching: false, isError: false, refetch: mockRefetch }),
}));
const slot = (start: string, label: string, full = false) => ({ start, end: start, label, full });
const SLOT_A = slot("2026-10-03T10:30:00.000Z", "12:30–13:00");
const SLOT_FULL = slot("2026-10-03T09:00:00.000Z", "11:00–11:30", true);
const SLOTS = { slotMinutes: 30, openNow: true, leadMinutes: 25, today: { date: "2026-10-02", slots: [] }, tomorrow: { date: "2026-10-03", slots: [SLOT_FULL, SLOT_A] }, firstAvailable: SLOT_A };
let mockSlots: unknown = SLOTS;
let mockOwed = 0;
// U49: the carried-balance read's state — settled unless a test says otherwise.
let mockBalanceState: "settled" | "loading" | "failed" = "settled";
const mockBalanceRefetch = jest.fn();
jest.mock("../../../src/query/use-order-flow", () => ({
  useScheduleSlots: () => ({ slots: mockSlots, isLoading: false, isError: false }),
  useCarriedBalance: () => ({
    owed: mockBalanceState === "settled" ? mockOwed : 0,
    settled: mockBalanceState === "settled",
    loading: mockBalanceState === "loading",
    failed: mockBalanceState === "failed",
    refetch: mockBalanceRefetch,
  }),
}));
let mockRxEnabled = false;
jest.mock("../../../src/net/use-order-flags", () => ({ useOrderFlags: () => ({ rxEnabled: mockRxEnabled }) }));
const mockRx = { pages: [] as { id: string; uri: string; key: string | null }[], uploading: false, keys: [] as string[], add: jest.fn(), remove: jest.fn(), restore: jest.fn(), replace: jest.fn(), clear: jest.fn() };
// U30: the screen's page-upload error handler, so a test can raise one.
let mockRxOnError: ((err: unknown) => void) | null = null;
jest.mock("../../../src/query/use-prescription-photos", () => ({
  RX_MAX_PAGES: 3,
  usePrescriptionPhotos: (onError: (err: unknown) => void) => {
    mockRxOnError = onError;
    return mockRx;
  },
}));

type Line = { dishId: string; name: string; priceUsd: number; quantity: number; note: string; rxRequired?: boolean };
type Venue = { businessType: "restaurant" | "shop"; shopKind: string | null } | null;
const mockCart = {
  ready: true,
  cart: { restaurantId: "m1" as string | null, restaurantName: "Gava’s Kitchen" as string | null, lines: [] as Line[], orderNote: "", venue: null as Venue },
  setQuantity: jest.fn(),
  removeItem: jest.fn(),
  replaceLines: jest.fn(),
  clear: jest.fn(),
};
jest.mock("../../../src/food/cart-context", () => ({ useFoodCart: () => mockCart }));

import { ApiError } from "../../../src/api/client";
import { routeAfterOrderPlaced } from "../../../src/push/ask-in-context";
import { ItemLine } from "../../../src/ui/orderflow/review";
import FoodReviewScreen from "../checkout";

const GAVA: Line[] = [
  { dishId: "d1", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "Extra gravy" },
  { dishId: "d2", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: "" },
];

let tree: renderer.ReactTestRenderer | null = null;
function render(): renderer.ReactTestRenderer {
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <FoodReviewScreen />
      </SafeAreaProvider>,
    );
  });
  // Let the saved phone resolve.
  act(() => {
    jest.advanceTimersByTime(0);
  });
  return tree!;
}
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}
function pressable(t: renderer.ReactTestRenderer, label: string | RegExp) {
  return t.root.findAll(
    (n) => typeof n.props.onPress === "function" && (typeof label === "string" ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel ?? "")),
  )[0];
}
function press(t: renderer.ReactTestRenderer, label: string | RegExp): void {
  const node = pressable(t, label);
  if (!node) throw new Error(`nothing pressable labelled ${String(label)}`);
  act(() => node.props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSavedPhone = "0771234567";
  mockMe = undefined;
  mockOnline = true;
  mockHome = { label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, area: "Belgravia" };
  mockMenu.restaurant.hours = null;
  mockMenu.restaurant.freeDelivery = false;
  mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6)];
  mockCart.cart = { restaurantId: "m1", restaurantName: "Gava’s Kitchen", lines: GAVA.map((l) => ({ ...l })), orderNote: "", venue: null };
  mockParams = {};
  mockSlots = SLOTS;
  mockOwed = 0;
  mockBalanceState = "settled";
  mockRxEnabled = false;
  mockRx.pages = [];
  mockRx.keys = [];
  mockRx.uploading = false;
  mockCart.replaceLines.mockReset();
  mockCart.clear.mockReset();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe("R1 — Review · restaurant", () => {
  it("draws the blocks in order with the cash total pinned in the CTA", async () => {
    const t = render();
    await flush();
    const all = texts(t);
    const order = ["Review order", "Gava’s Kitchen", "ITEMS", "Sadza & beef stew", "+ Add more items", "DELIVER TO", "12 Lanark Rd, Belgravia", "WHEN", "As soon as possible", "YOUR PHONE", "0771 234 567", "NOTE FOR THE RIDER", "PAY", "Cash at the door", "Food", "Delivery fee", "Total", "Free to cancel until the rider collects your order."];
    let at = -1;
    for (const s of order) {
      const i = all.indexOf(s, at + 1);
      expect([s, i > at]).toEqual([s, true]);
      at = i;
    }
    expect(all.some((s) => /^Place order · \$\d+\.\d\d cash$/.test(s))).toBe(true);
    expect(all.some((s) => /^Arrives \d\d:\d\d–\d\d:\d\d$/.test(s))).toBe(true);
    // WHEN is the ASAP / Schedule segmented control (R1); a kitchen has no out-of-stock choice (R2 is shops).
    expect(all).toContain("Schedule");
    expect(all).not.toContain("IF SOMETHING’S OUT OF STOCK");
    expect(all).not.toContain("PRESCRIPTION");
    // Cash only (BRIEF §14).
    expect(all.join(" ")).not.toMatch(/wallet|mobile money|ecocash|innbucks/i);
  });

  // D-71: free delivery paid by the venue — "Delivery: Free, paid by <venue>" (calm-mint-v2 README §5).
  it("D-71: a free-delivery venue reads “Free, paid by …” and the cash total is the food alone", async () => {
    mockMenu.restaurant.freeDelivery = true;
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Free, paid by Gava’s Kitchen");
    // $9.00 + $6.00 food, $0 delivery.
    expect(all).toContain("Place order · $15.00 cash");
  });

  it("D-71: without the venue's flag the fee is charged as before", async () => {
    const t = render();
    await flush();
    const all = texts(t);
    expect(all.some((s) => s.startsWith("Free, paid by"))).toBe(false);
    expect(all).not.toContain("Place order · $15.00 cash");
  });

  it("edits quantities in place — − lowers, the bin at 1 removes, + adds", () => {
    const t = render();
    press(t, "One less Sadza & beef stew");
    expect(mockCart.setQuantity).toHaveBeenCalledWith("d1", "Extra gravy", 1);
    press(t, "Remove Roast chicken (half)");
    expect(mockCart.removeItem).toHaveBeenCalledWith("d2", "");
    press(t, "One more Roast chicken (half)");
    expect(mockCart.setQuantity).toHaveBeenCalledWith("d2", "", 2);
  });

  it("+ Add more items goes back to the storefront", () => {
    const t = render();
    const add = t.root.findAll((n) => n.props.accessibilityRole === "button" && n.props.children === "+ Add more items" && typeof n.props.onPress === "function")[0]!;
    act(() => add.props.onPress());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("Place order", () => {
  it("sends the unchanged cash payload, then REPLACES the food stack with the order (Back goes Home)", async () => {
    mockPlace.mockResolvedValue({ id: "fo-9" });
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(1);
    const [rid, body] = mockPlace.mock.calls[0]!;
    expect(rid).toBe("m1");
    expect(body).toMatchObject({
      items: [
        { dishId: "d1", quantity: 2, note: "Extra gravy" },
        { dishId: "d2", quantity: 1 },
      ],
      dropoff: { point: { lat: -17.8, lng: 31.05 }, landmark: "12 Lanark Rd, Belgravia", contactPhone: "+263771234567" },
      paymentMethod: "cash",
    });
    expect(typeof body.idempotencyKey).toBe("string");
    expect(mockCart.clear).toHaveBeenCalled();
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/order/fo-9");
  });

  it("R7b — a failure is an ink toast with ↻ Try again, staying on Review", async () => {
    mockPlace.mockRejectedValue(new Error("network"));
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(texts(t)).toContain("Couldn’t place your order. Nothing was ordered.");
    expect(texts(t)).toContain("↻ Try again");
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // U23: a lost answer is replayed once (same body), then R7b — not more.
    expect(mockPlace).toHaveBeenCalledTimes(2);
  });

  it("a 409 from the kitchen speaks the server's reason and refetches the menu", async () => {
    mockPlace.mockRejectedValue(new ApiError(409, "Sadza & beef stew is out of stock right now"));
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(texts(t)).toContain("Sadza & beef stew is out of stock right now");
    expect(mockRefetch).toHaveBeenCalled();
    // U23: a 4xx is the server's answer — never replayed.
    expect(mockPlace).toHaveBeenCalledTimes(1);
  });
});

describe("U08 — YOUR PHONE on a first order", () => {
  it("no phone saved on this install: the block is prefilled with the account's own number and Place uses it", async () => {
    mockSavedPhone = null;
    mockMe = { phone: "+263772000111" };
    mockPlace.mockResolvedValue({ id: "fo-1" });
    const t = render();
    await flush();
    expect(texts(t)).toContain("0772 000 111");
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(1);
    expect(mockPlace.mock.calls[0]![1]).toMatchObject({ dropoff: { contactPhone: "+263772000111" } });
  });

  it("a phone saved from a past order still wins over the account's number", async () => {
    mockMe = { phone: "+263772000111" };
    const t = render();
    await flush();
    expect(texts(t)).toContain("0771 234 567");
    expect(texts(t)).not.toContain("0772 000 111");
  });

  it("no usable phone at all: Place focuses the (already open) phone field instead of doing nothing", async () => {
    mockSavedPhone = null;
    const t = render();
    await flush();
    // The empty field is already mounted (an empty phone opens it), so flipping autoFocus did nothing.
    const input = t.root.findAll((n) => n.props.accessibilityLabel === "YOUR PHONE" && typeof n.instance?.focus === "function")[0]!;
    const focus = input.instance.focus as jest.Mock;
    focus.mockClear();
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("States", () => {
  it("R4 — under $4.00 shows the small-order hint and fee row", async () => {
    mockCart.cart.lines = [{ dishId: "d1", name: "Sadza & beef stew", priceUsd: 3.3, quantity: 1, note: "" }];
    mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 3.3)];
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Add $0.70 more to skip the $1.00 small-order fee.");
    expect(all).toContain("Small-order fee");
  });

  it("R6a — a sold-out dish is struck off and a price rise is flagged", async () => {
    mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 5), dish("d2", "Roast chicken (half)", 6, { outOfStock: true })];
    const t = render();
    await flush();
    expect(mockCart.replaceLines).toHaveBeenCalledWith([{ dishId: "d1", name: "Sadza & beef stew", priceUsd: 5, quantity: 2, note: "Extra gravy" }]);
    const all = texts(t);
    expect(all).toContain("Some things changed since you added them");
    expect(all).toContain("Sold out now — taken off");
    expect(all).toContain("Price went up $4.50 → $5.00");
  });

  it("R6b — the kitchen just closed: a sheet, nothing ordered, Schedule for the first slot or See open places", async () => {
    mockMenu.restaurant.hours = {}; // a configured week with no open day: closed now
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Gava’s Kitchen just closed");
    expect(all).toContain("See open places");
    press(t, "Schedule for tomorrow 12:30–13:00");
    expect(texts(t)).not.toContain("Gava’s Kitchen just closed");
    expect(texts(t)).toContain("Scheduled · Tomorrow 12:30–13:00");
  });

  it("R6b without a slot to offer: only See open places", async () => {
    mockMenu.restaurant.hours = {};
    mockSlots = { ...SLOTS, tomorrow: { date: "2026-10-03", slots: [] }, firstAvailable: null };
    const t = render();
    await flush();
    expect(texts(t).some((s) => s.startsWith("Schedule for"))).toBe(false);
    expect(texts(t)).toContain("See open places");
  });

  it("R7c — offline: the ink-less note on top, the CTA disabled with why", async () => {
    mockOnline = false;
    const t = render();
    await flush();
    const all = texts(t);
    expect(all.some((s) => /^You’re offline · last update \d\d:\d\d$/.test(s))).toBe(true);
    expect(all).toContain("You’re offline. Connect to place your order — your cart is saved.");
    expect(pressable(t, /^Place order · /)!.props.accessibilityState.disabled).toBe(true);
  });

  it("R9a — an empty cart says so and offers Browse places", () => {
    mockCart.cart = { restaurantId: null, restaurantName: null, lines: [], orderNote: "", venue: null };
    const t = render();
    const all = texts(t);
    expect(all).toContain("Your cart is empty");
    press(t, "Browse places");
    expect(mockRouter.replace).toHaveBeenCalledWith("/food");
  });

  it("R9b — no address: no fee, no ETA, the CTA blocked with why", async () => {
    mockHome = { label: "Set your location", point: null, area: null };
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Set your address to see the delivery fee and when it arrives.");
    expect(all).toContain("Set a delivery address to place your order");
    expect(all).not.toContain("Delivery fee");
    expect(all.some((s) => s.startsWith("Arrives"))).toBe(false);
  });

  it("R3a/R3b — Deliver to ✎ opens the inline address card; out of area blocks Use this address", async () => {
    const t = render();
    await flush();
    const edits = t.root.findAll((n) => typeof n.props.onPress === "function" && n.findAllByType(Text).some((x) => x.props.children === "Edit"));
    act(() => edits[0]!.props.onPress());
    let all = texts(t);
    expect(all).toContain("Where should we deliver?");
    expect(all).toContain("Use my current location");
    expect(all).toContain("Drag the map to put the pin on your gate");
    expect(pressable(t, "Use this address")!.props.accessibilityState.disabled).toBe(false);
    // Move the draft far outside the corridor.
    const edit = t.root.findAll((n) => typeof n.props.onMove === "function")[0]!;
    act(() => edit.props.onMove({ lat: -15.4167, lng: 28.2833 }));
    all = texts(t);
    expect(all.some((s) => /doesn’t deliver to/.test(s))).toBe(true);
    expect(all).toContain("Pick an address Gava’s Kitchen delivers to");
    expect(pressable(t, "Use this address")!.props.accessibilityState.disabled).toBe(true);
  });
});

const FRESH: Line[] = [
  { dishId: "i1", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: "" },
  { dishId: "i2", name: "Eggs (tray of 30)", priceUsd: 5.5, quantity: 1, note: "" },
];
function shopCart(kind: "grocery" | "pharmacy", lines: Line[] = FRESH): void {
  mockShop.shop.shopKind = kind;
  mockShop.shop.name = kind === "pharmacy" ? "Avondale Pharmacy" : "Avondale Fresh";
  mockShop.categories[0]!.dishes = lines.map((l) => dish(l.dishId, l.name, l.priceUsd, l.rxRequired ? { rxRequired: true } : {}));
  mockCart.cart = { restaurantId: "s1", restaurantName: mockShop.shop.name, lines: lines.map((l) => ({ ...l })), orderNote: "", venue: { businessType: "shop", shopKind: kind } };
}

describe("R2a / R2b — shops and pharmacies (Order flow v2 part 5)", () => {
  it("R2a — a shop: Shop sub-line, IF SOMETHING'S OUT OF STOCK (Ask me), Items in the breakdown", async () => {
    shopCart("grocery");
    const t = render();
    await flush();
    const all = texts(t);
    const order = ["Avondale Fresh", "Shop", "ITEMS", "DELIVER TO", "WHEN", "IF SOMETHING’S OUT OF STOCK", "Ask me", "Remove it", "YOUR PHONE", "Items", "Delivery fee", "Total"];
    let at = -1;
    for (const s of order) {
      const i = all.indexOf(s, at + 1);
      expect([s, i > at]).toEqual([s, true]);
      at = i;
    }
    expect(all).toContain("The shop sends a swap or asks to remove it. You have 3 minutes to answer.");
    expect(all).not.toContain("Food");
    expect(all).not.toContain("Over-the-counter medicine only. A pharmacist packs every order.");
  });

  it("R2b — a pharmacy: the OTC notice, and Remove it travels as outOfStockPref", async () => {
    shopCart("pharmacy");
    mockPlace.mockResolvedValue({ id: "fo-2" });
    const t = render();
    await flush();
    expect(texts(t)).toContain("Over-the-counter medicine only. A pharmacist packs every order.");
    press(t, "Remove it");
    expect(texts(t)).toContain("Missing items are taken off and the total goes down. Nothing to answer.");
    press(t, /^Place order · /);
    await flush();
    const [rid, body] = mockPlace.mock.calls[0]!;
    expect(rid).toBe("s1");
    expect(body.outOfStockPref).toBe("remove");
    expect(body.scheduledFor).toBeUndefined();
    expect(body.prescription).toBeUndefined();
  });

  it("FS-5 (E2E 2026-10-05) — no 'Over-the-counter only' note while prescriptions are on", async () => {
    mockRxEnabled = true;
    shopCart("pharmacy");
    const t = render();
    await flush();
    expect(texts(t)).not.toContain("Over-the-counter medicine only. A pharmacist packs every order.");
  });

  it("a kitchen never sends outOfStockPref", async () => {
    mockPlace.mockResolvedValue({ id: "fo-3" });
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace.mock.calls[0]![1].outOfStockPref).toBeUndefined();
  });

  it("+ Add more items from a shop with no history goes to the shop's storefront", () => {
    shopCart("grocery");
    mockRouter.canGoBack.mockReturnValueOnce(false);
    const t = render();
    const add = t.root.findAll((n) => n.props.accessibilityRole === "button" && n.props.children === "+ Add more items" && typeof n.props.onPress === "function")[0]!;
    act(() => add.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith("/shops/s1");
  });
});

describe("R5a–c — scheduled", () => {
  it("R5a → R5b: Schedule opens the sheet (Full can't be picked), Arrive … sets the slot and it is sent", async () => {
    mockPlace.mockResolvedValue({ id: "fo-5" });
    const t = render();
    await flush();
    press(t, "Schedule");
    let all = texts(t);
    expect(all).toContain("When should it arrive?");
    expect(all).toContain("11:00–11:30 · Full");
    expect(pressable(t, "11:00–11:30 · Full")!.props.disabled).toBe(true);
    expect(all).toContain("Slots are 30 minutes. Gava’s Kitchen starts cooking so it arrives inside your slot.");
    press(t, "12:30–13:00");
    press(t, "Arrive tomorrow 12:30–13:00");
    all = texts(t);
    expect(all).toContain("Scheduled · Tomorrow 12:30–13:00");
    expect(all.some((s) => /^Gava’s Kitchen starts cooking at \d\d:\d\d\. Free to cancel until then\.$/.test(s))).toBe(true);
    expect(all.some((s) => s.startsWith("Arrives"))).toBe(false);
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace.mock.calls[0]![1].scheduledFor).toBe(SLOT_A.start);
  });

  it("R5c — arriving from the closed venue's bar (?schedule=first) opens on the first slot, no closed sheet", async () => {
    mockMenu.restaurant.hours = {};
    mockParams = { schedule: "first" };
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Scheduled · Tomorrow 12:30–13:00");
    expect(all).not.toContain("Gava’s Kitchen just closed");
  });

  it("a shop says packing in the scheduled row", async () => {
    shopCart("grocery");
    mockParams = { schedule: "first" };
    const t = render();
    await flush();
    expect(texts(t).some((s) => /^Avondale Fresh starts packing at \d\d:\d\d\./.test(s))).toBe(true);
  });
});

describe("R8a / R8b — prescription (behind rxEnabled)", () => {
  const RX: Line[] = [
    { dishId: "i3", name: "Amoxicillin 500mg (21 caps)", priceUsd: 4.2, quantity: 1, note: "", rxRequired: true },
    { dishId: "i4", name: "Paracetamol 500mg (20 tabs)", priceUsd: 1.5, quantity: 1, note: "" },
  ];

  it("flag off: nothing Rx renders", async () => {
    // Off, the server lists no "Prescription needed" item, so neither the catalogue nor the cart has one.
    shopCart("pharmacy", RX.map(({ rxRequired: _rx, ...l }) => l));
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).not.toContain("PRESCRIPTION");
    expect(all).not.toContain("Prescription needed");
  });

  // U09: the line was added while `/app/order-flags` hadn't answered (stamped without rxRequired), and the
  // flag still reads its fail-closed default here. The latest catalogue marks the item, so Review asks for
  // the prescription (instead of letting Place fail with nowhere to add one) and the line is re-stamped.
  it("U09: a line stamped before the Rx flag loaded still needs its prescription (from the catalogue)", async () => {
    mockRxEnabled = false;
    shopCart("pharmacy", RX);
    mockCart.cart.lines = RX.map(({ rxRequired: _rx, ...l }) => ({ ...l }));
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("PRESCRIPTION");
    expect(all).toContain("Prescription needed");
    expect(all.some((x) => x.startsWith("Over-the-counter"))).toBe(false);
    expect(pressable(t, /^Place order · /)!.props.accessibilityState.disabled).toBe(true);
    expect(mockCart.replaceLines).toHaveBeenCalledWith([expect.objectContaining({ dishId: "i3", rxRequired: true }), expect.not.objectContaining({ rxRequired: true })]);
  });

  it("R8a — empty: the block above Items, Take photo / From gallery, placing blocked with one hint line", async () => {
    mockRxEnabled = true;
    shopCart("pharmacy", RX);
    const t = render();
    await flush();
    const all = texts(t);
    expect(all.indexOf("PRESCRIPTION")).toBeLessThan(all.indexOf("ITEMS"));
    expect(all).toContain("Up to 3 pages. A pharmacist checks it before packing.");
    expect(all).toContain("Prescription needed");
    expect(all).toContain("Add a photo of your prescription to place this order");
    expect(pressable(t, /^Place order · /)!.props.accessibilityState.disabled).toBe(true);
    press(t, "Take photo");
    expect(mockRx.add).toHaveBeenCalledWith("camera");
    press(t, "From gallery");
    expect(mockRx.add).toHaveBeenCalledWith("gallery");
  });

  it("R8b — added: thumbs after Items, patient + consent, and the prescription travels in the body", async () => {
    mockRxEnabled = true;
    shopCart("pharmacy", RX);
    mockRx.pages = [
      { id: "rx-1", uri: "file:///p1.jpg", key: "rx/u/1.jpg" },
      { id: "rx-2", uri: "file:///p2.jpg", key: "rx/u/2.jpg" },
    ];
    mockRx.keys = ["rx/u/1.jpg", "rx/u/2.jpg"];
    mockPlace.mockResolvedValue({ id: "fo-8" });
    const t = render();
    await flush();
    let all = texts(t);
    expect(all.indexOf("PRESCRIPTION")).toBeGreaterThan(all.indexOf("ITEMS"));
    expect(all).toContain("Patient name");
    expect(pressable(t, /^Place order · /)!.props.accessibilityState.disabled).toBe(false);
    // No patient yet → said once, nothing sent.
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).not.toHaveBeenCalled();
    const field = t.root.findAll((n) => n.props.accessibilityLabel === "Patient name" && typeof n.props.onChangeText === "function")[0]!;
    act(() => field.props.onChangeText("Rudo Moyo"));
    press(t, /^Place order · /);
    await flush();
    all = texts(t);
    expect(all).toContain("I’ll show the original prescription to the rider");
    expect(mockPlace).not.toHaveBeenCalled();
    press(t, "I’ll show the original prescription to the rider");
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace.mock.calls[0]![1].prescription).toEqual({ photoKeys: ["rx/u/1.jpg", "rx/u/2.jpg"], patientName: "Rudo Moyo", consent: true });
  });

  it("R8c / R8d (brief 09, D-97): each thumb has a 44 'Remove page {n}' badge; remove raises 'Page removed' + Undo", async () => {
    mockRxEnabled = true;
    shopCart("pharmacy", RX);
    const p2 = { id: "rx-2", uri: "file:///p2.jpg", key: null };
    mockRx.pages = [{ id: "rx-1", uri: "file:///p1.jpg", key: "rx/u/1.jpg" }, p2];
    mockRx.uploading = true;
    const t = render();
    await flush();
    const badge = pressable(t, "Remove page 2")!;
    expect(badge.props.accessibilityRole).toBe("button");
    expect([badge.props.style].flat()).toEqual(expect.arrayContaining([expect.objectContaining({ width: 44, height: 44 })]));
    expect(pressable(t, "Remove page 1")).toBeTruthy();
    expect(pressable(t, "Page 1, open")).toBeTruthy();
    // A page still uploading is removable too.
    press(t, "Remove page 2");
    expect(mockRx.remove).toHaveBeenCalledWith("rx-2");
    expect(texts(t)).toContain("Page removed");
    press(t, "Undo");
    expect(mockRx.restore).toHaveBeenCalledWith(p2, 1);
    expect(texts(t)).not.toContain("Page removed");
  });

  it("R8e (brief 09, D-97): the thumb opens the page viewer — Page n of total, Remove, Retake, Close", async () => {
    mockRxEnabled = true;
    shopCart("pharmacy", RX);
    mockRx.pages = [
      { id: "rx-1", uri: "file:///p1.jpg", key: "rx/u/1.jpg" },
      { id: "rx-2", uri: "file:///p2.jpg", key: "rx/u/2.jpg" },
    ];
    mockRx.keys = ["rx/u/1.jpg", "rx/u/2.jpg"];
    const t = render();
    await flush();
    expect(texts(t)).not.toContain("Page 2 of 2");
    press(t, "Page 2, open");
    expect(texts(t)).toContain("Page 2 of 2");
    press(t, "Close");
    expect(texts(t)).not.toContain("Page 2 of 2");
    press(t, "Page 2, open");
    press(t, "Retake");
    expect(texts(t)).not.toContain("Page 2 of 2");
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockRx.replace).toHaveBeenCalledWith("rx-2", "camera");
    press(t, "Page 1, open");
    press(t, "Remove");
    expect(mockRx.remove).toHaveBeenCalledWith("rx-1");
    expect(texts(t)).not.toContain("Page 1 of 2");
    expect(texts(t)).toContain("Page removed");
  });
});

describe("BRIEF D3f — a balance owed from a cancel after collection", () => {
  it("is its own breakdown row and inside the total and the CTA", async () => {
    mockOwed = 16.5;
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Owed from a cancelled order");
    const placeLabel = all.find((s) => s.startsWith("Place order · "))!;
    const total = Number(/\$(\d+\.\d\d)/.exec(placeLabel)![1]);
    expect(total).toBeGreaterThan(31.5);
  });

  it("U49: Place waits in its loading state while the balance is still being read — nothing is placed", async () => {
    mockBalanceState = "loading";
    const t = render();
    await flush();
    const place = pressable(t, /^Place order · /)!;
    expect(place.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    act(() => place.props.onPress());
    await flush();
    expect(mockPlace).not.toHaveBeenCalled();
  });

  it("U49: a failed balance read never places on a total without it — the R7b toast, and Try again re-reads the balance", async () => {
    mockBalanceState = "failed";
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).not.toHaveBeenCalled();
    expect(texts(t)).toContain("Couldn’t place your order. Nothing was ordered.");
    mockBalanceRefetch.mockClear();
    press(t, "↻ Try again");
    expect(mockBalanceRefetch).toHaveBeenCalledTimes(1);
    expect(mockPlace).not.toHaveBeenCalled();
  });
});

describe("Reviewed list 2026-10-07 — Review & place (wave 4, lane B)", () => {
  const openEditor = (t: renderer.ReactTestRenderer): void => {
    const edits = t.root.findAll((n) => typeof n.props.onPress === "function" && n.findAllByType(Text).some((x) => x.props.children === "Edit"));
    act(() => edits[0]!.props.onPress());
  };

  it("U23: a lost answer (status 0) replays the SAME body and key once, and the order it lands on is shown", async () => {
    mockPlace.mockRejectedValueOnce(new ApiError(0, "The network is slow — check your connection and try again.")).mockResolvedValueOnce({ id: "fo-23" });
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(2);
    expect(mockPlace.mock.calls[1]![1]).toBe(mockPlace.mock.calls[0]![1]);
    expect(mockPlace.mock.calls[1]![1].idempotencyKey).toBe(mockPlace.mock.calls[0]![1].idempotencyKey);
    expect(texts(t)).not.toContain("Couldn’t place your order. Nothing was ordered.");
    expect(mockRouter.replace).toHaveBeenCalledWith("/order/fo-23");
  });

  it("U23: a 5xx from a proxy is replayed too", async () => {
    mockPlace.mockRejectedValueOnce(new ApiError(502, "Bad gateway")).mockResolvedValueOnce({ id: "fo-24" });
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith("/order/fo-24");
  });

  it("U23 review: an attempt lost twice is resent as-is (same body and key) after an edit, until the server answers", async () => {
    const lost = (): ApiError => new ApiError(0, "Can't reach LyniaGo — check your connection and try again.");
    mockPlace.mockRejectedValueOnce(lost()).mockRejectedValueOnce(lost());
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(2);
    expect(texts(t)).toContain("Couldn’t place your order. Nothing was ordered.");
    const sent = mockPlace.mock.calls[0]![1];
    // The customer changes the basket (the key would change with it) and places again.
    mockCart.cart = { ...mockCart.cart, lines: [{ ...GAVA[0]!, quantity: 3 }, { ...GAVA[1]! }] };
    const rerender = (): void => {
      act(() =>
        t.update(
          <SafeAreaProvider initialMetrics={TEST_METRICS}>
            <FoodReviewScreen />
          </SafeAreaProvider>,
        ),
      );
    };
    rerender();
    // The server answers this time — a definitive "no" (4xx).
    mockPlace.mockRejectedValueOnce(new ApiError(409, "Sadza & beef stew just sold out."));
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(3);
    expect(mockPlace.mock.calls[2]![1]).toBe(sent);
    // Settled: the next Place is the basket on screen, under its own key.
    mockPlace.mockResolvedValueOnce({ id: "fo-23b" });
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(4);
    const fresh = mockPlace.mock.calls[3]![1];
    expect(fresh).not.toBe(sent);
    expect(fresh.idempotencyKey).not.toBe(sent.idempotencyKey);
    expect(fresh.items[0]).toMatchObject({ quantity: 3 });
  });

  it("U23 review: a lost answer then a 4xx on the replay is definitive — the next Place builds a new body", async () => {
    mockPlace.mockRejectedValueOnce(new ApiError(0, "lost")).mockRejectedValueOnce(new ApiError(409, "Sadza & beef stew just sold out."));
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(2);
    mockPlace.mockResolvedValueOnce({ id: "fo-23c" });
    press(t, /^Place order · /);
    await flush();
    await flush();
    expect(mockPlace).toHaveBeenCalledTimes(3);
    expect(mockPlace.mock.calls[2]![1]).not.toBe(mockPlace.mock.calls[0]![1]);
  });

  it("U24: Back can't remove Review while placing, and a placed order is shown even after the screen is gone", async () => {
    let resolve!: (o: { id: string }) => void;
    mockPlace.mockReturnValue(new Promise((r) => (resolve = r)));
    const t = render();
    await flush();
    press(t, /^Place order · /);
    // While the request is out, a removal (the web's browser Back) is refused.
    const preventDefault = jest.fn();
    expect(mockBeforeRemove.length).toBeGreaterThan(0);
    mockBeforeRemove.forEach((cb) => cb({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    // The screen goes anyway (a reload, a stack reset): the order still opens once it lands.
    act(() => t.unmount());
    tree = null;
    await act(async () => {
      resolve({ id: "fo-77" });
      await Promise.resolve();
    });
    await flush();
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/order/fo-77");
  });

  it("U26: a deliver-to outside the area opens R3b on Place instead of placing", async () => {
    mockHome = { label: "Lusaka", point: { lat: -15.4167, lng: 28.2833 }, area: null };
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace).not.toHaveBeenCalled();
    const all = texts(t);
    expect(all.some((s) => s.startsWith("Gava’s Kitchen doesn’t deliver to Lusaka."))).toBe(true);
    expect(all).toContain("Pick an address Gava’s Kitchen delivers to");
    expect(pressable(t, "Use this address")!.props.accessibilityState.disabled).toBe(true);
  });

  it("U27: a moved pin is labelled by its coordinates until named — never the old address", async () => {
    mockPlace.mockResolvedValue({ id: "fo-27" });
    const t = render();
    await flush();
    openEditor(t);
    const edit = t.root.findAll((n) => typeof n.props.onMove === "function")[0]!;
    act(() => edit.props.onMove({ lat: -17.82, lng: 31.04 }));
    press(t, "Use this address");
    expect(texts(t)).toContain("-17.82000, 31.04000");
    expect(texts(t)).not.toContain("12 Lanark Rd, Belgravia");
    press(t, /^Place order · /);
    await flush();
    expect(mockPlace.mock.calls[0]![1].dropoff).toMatchObject({ point: { lat: -17.82, lng: 31.04 }, landmark: "-17.82000, 31.04000" });
  });

  it("U27: with no address before, a moved pin is still never blank", async () => {
    mockHome = { label: "Set your location", point: null, area: null };
    const t = render();
    await flush();
    openEditor(t);
    const edit = t.root.findAll((n) => typeof n.props.onMove === "function")[0]!;
    act(() => edit.props.onMove({ lat: -17.8, lng: 31.05 }));
    press(t, "Use this address");
    expect(texts(t)).toContain("-17.80000, 31.05000");
  });

  it("U27 review: a reverse geocode for a position the pin has left names nothing — not the label, not the field", async () => {
    const t = render();
    await flush();
    openEditor(t);
    const editor = (): renderer.ReactTestInstance => t.root.findAll((n) => typeof n.props.onMove === "function")[0]!;
    act(() => editor().props.onMove({ lat: -17.82, lng: 31.04 }));
    act(() => editor().props.onMove({ lat: -17.83, lng: 31.03 }));
    // The answer for the first position arrives late.
    act(() => editor().props.onName({ lat: -17.82, lng: 31.04 }, "Avondale Shops"));
    expect(editor().props.query).not.toBe("Avondale Shops");
    expect(editor().props.draft).toMatchObject({ lat: -17.83, lng: 31.03, label: "-17.83000, 31.03000" });
    // The answer for where the pin is now names both.
    act(() => editor().props.onName({ lat: -17.83, lng: 31.03 }, "Marlborough"));
    expect(editor().props.query).toBe("Marlborough");
    expect(editor().props.draft).toMatchObject({ label: "Marlborough" });
  });

  it("U41: Android Back while editing the address closes the editor and stays on Review", async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((event: string, cb: () => boolean | null | undefined) => {
      if (event === "hardwareBackPress") handlers.push(cb as () => boolean);
      return { remove: () => handlers.splice(handlers.indexOf(cb as () => boolean), 1) } as never;
    });
    try {
      const t = render();
      await flush();
      expect(handlers).toHaveLength(0);
      openEditor(t);
      expect(texts(t)).toContain("Where should we deliver?");
      expect(handlers).toHaveLength(1);
      let handled: boolean | undefined;
      act(() => {
        handled = handlers[handlers.length - 1]!();
      });
      expect(handled).toBe(true);
      expect(texts(t)).not.toContain("Where should we deliver?");
      expect(texts(t)).toContain("YOUR PHONE");
      expect(mockRouter.back).not.toHaveBeenCalled();
      // Closed: Back is the stack's again.
      expect(handlers).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("U50: a saved basket that all sold out says why above R9a, and Browse goes back to its section", async () => {
    shopCart("pharmacy");
    mockShop.categories[0]!.dishes = mockShop.categories[0]!.dishes.map((d) => ({ ...d, outOfStock: true }));
    mockCart.replaceLines.mockImplementation((lines: Line[]) => {
      if (lines.length === 0) mockCart.cart = { restaurantId: null, restaurantName: null, lines: [], orderNote: "", venue: null };
    });
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Your cart is empty");
    expect(all).toContain("Some things changed since you added them");
    expect(all).toContain("Bread (Lobels 700g)");
    expect(all.filter((s) => s === "Sold out now — taken off")).toHaveLength(2);
    expect(all.indexOf("Some things changed since you added them")).toBeLessThan(all.indexOf("Your cart is empty"));
    press(t, "Browse places");
    expect(mockRouter.replace).toHaveBeenCalledWith("/pharmacy");
  });

  it("U50 review: a basket the customer emptied after an earlier sell-out is plain R9a", async () => {
    mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6, { outOfStock: true })];
    mockCart.replaceLines.mockImplementation((lines: Line[]) => {
      mockCart.cart = { ...mockCart.cart, lines };
    });
    const t = render();
    await flush();
    expect(texts(t)).toContain("Some things changed since you added them");
    // The customer takes the last line off themselves.
    mockCart.cart = { restaurantId: null, restaurantName: null, lines: [], orderNote: "", venue: null };
    act(() =>
      t.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <FoodReviewScreen />
        </SafeAreaProvider>,
      ),
    );
    const all = texts(t);
    expect(all).toContain("Your cart is empty");
    expect(all).not.toContain("Some things changed since you added them");
    expect(all).not.toContain("Sold out now — taken off");
  });

  it("U51: a price drop is not flagged “went up” — only the struck old price shows", async () => {
    mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 4), dish("d2", "Roast chicken (half)", 6)];
    const t = render();
    await flush();
    const all = texts(t);
    expect(all.some((s) => s.startsWith("Price went up"))).toBe(false);
    const line = t.root.findAllByType(ItemLine).find((n) => n.props.name === "Sadza & beef stew")!;
    expect(line.props.was).toBe(9);
    expect(line.props.flag).toBeNull();
  });

  it("U52: the cart is cleared only once the order's route is known, and Review never draws R9a on the way out", async () => {
    mockPlace.mockResolvedValue({ id: "fo-52" });
    mockCart.clear.mockImplementation(() => {
      mockCart.cart = { restaurantId: null, restaurantName: null, lines: [], orderNote: "", venue: null };
    });
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    await flush();
    const route = (routeAfterOrderPlaced as jest.Mock).mock;
    expect(route.calls).toHaveLength(1);
    expect(mockCart.clear.mock.invocationCallOrder[0]!).toBeGreaterThan(route.invocationCallOrder[0]!);
    expect(mockRouter.replace).toHaveBeenCalledWith("/order/fo-52");
    // The outgoing screen re-renders (the exit animation): still the placed basket, not "Your cart is empty".
    act(() =>
      t.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <FoodReviewScreen />
        </SafeAreaProvider>,
      ),
    );
    expect(texts(t)).not.toContain("Your cart is empty");
    expect(texts(t)).toContain("Sadza & beef stew");
  });

  describe("prescription (R8b)", () => {
    const RX: Line[] = [{ dishId: "i3", name: "Amoxicillin 500mg (21 caps)", priceUsd: 4.2, quantity: 1, note: "", rxRequired: true }];
    const withPages = (): void => {
      mockRxEnabled = true;
      shopCart("pharmacy", RX);
      mockRx.pages = [{ id: "rx-1", uri: "file:///p1.jpg", key: "rx/u/1.jpg" }];
      mockRx.keys = ["rx/u/1.jpg"];
    };
    const fillRx = (t: renderer.ReactTestRenderer): void => {
      const field = t.root.findAll((n) => n.props.accessibilityLabel === "Patient name" && typeof n.props.onChangeText === "function")[0]!;
      act(() => field.props.onChangeText("Rudo Moyo"));
      press(t, "I’ll show the original prescription to the rider");
    };

    it("U64: a missing patient name or consent tick is said as a sentence, not the field's label", async () => {
      withPages();
      const t = render();
      await flush();
      press(t, /^Place order · /);
      expect(texts(t)).toContain("Add the patient’s name to place this order");
      const field = t.root.findAll((n) => n.props.accessibilityLabel === "Patient name" && typeof n.props.onChangeText === "function")[0]!;
      act(() => field.props.onChangeText("Rudo Moyo"));
      press(t, /^Place order · /);
      expect(texts(t)).toContain("Confirm you’ll show the original prescription to the rider");
      expect(mockPlace).not.toHaveBeenCalled();
    });

    it("U29: a page placement refused (422 upload_*) clears the pages back to R8a and says why — not replayed", async () => {
      withPages();
      mockPlace.mockRejectedValue(new ApiError(422, "We couldn’t find that photo — please retake it.", "upload_missing"));
      const t = render();
      await flush();
      fillRx(t);
      press(t, /^Place order · /);
      await flush();
      expect(mockPlace).toHaveBeenCalledTimes(1);
      expect(mockRx.clear).toHaveBeenCalledTimes(1);
      expect(texts(t)).toContain("We couldn’t find that photo — please retake it.");
    });

    it("U29: any other refusal keeps the pages", async () => {
      withPages();
      mockPlace.mockRejectedValue(new ApiError(422, "dropoff: Too small", "validation_failed"));
      const t = render();
      await flush();
      fillRx(t);
      press(t, /^Place order · /);
      await flush();
      expect(mockRx.clear).not.toHaveBeenCalled();
    });

    it("U30: a page the server refused says the server's reason; only a lost answer is “No connection”", async () => {
      withPages();
      const t = render();
      await flush();
      act(() => mockRxOnError!(new ApiError(503, "Photo uploads are paused — try again in a few minutes.", "uploads_unavailable")));
      expect(texts(t)).toContain("Photo uploads are paused — try again in a few minutes.");
      act(() => mockRxOnError!(new ApiError(0, "Can't reach LyniaGo — check your connection and try again.")));
      expect(texts(t)).toContain("No connection. Nothing was sent.");
    });

    it("U30 review: any other 5xx is not shown raw — it is the fallback copy", async () => {
      withPages();
      const t = render();
      await flush();
      act(() => mockRxOnError!(new ApiError(500, "Internal server error")));
      expect(texts(t)).not.toContain("Internal server error");
      expect(texts(t)).toContain("No connection. Nothing was sent.");
    });
  });
});
