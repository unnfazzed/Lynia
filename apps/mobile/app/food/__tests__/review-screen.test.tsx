/**
 * Review & place — Order flow v2.1 R1–R9 (packages/design/handoff/order-flow-v2, ledger D-59): cart and
 * checkout as ONE screen. R1 blocks + pinned cash CTA, inline steppers, R3a/R3b inline address, R4 small-
 * order hint, R6a reconcile, R6b just closed, R7b failed toast, R7c offline, R9a empty, R9b no address,
 * and the exact place-order payload + the replace-into-the-order navigation.
 */
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";

jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { schedule?: string } = {};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useNavigation: () => ({ setOptions: () => undefined }), Redirect: () => null }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));

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
jest.mock("../../../src/logic/saved-recipients", () => ({ loadMyPickupPhone: () => Promise.resolve("0771234567"), saveMyPickupPhone: jest.fn(() => Promise.resolve()) }));
jest.mock("../../../src/push/ask-in-context", () => ({ askNotificationsInContext: jest.fn() }));
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
jest.mock("../../../src/query/use-order-flow", () => ({
  useScheduleSlots: () => ({ slots: mockSlots, isLoading: false, isError: false }),
  useCarriedBalance: () => mockOwed,
}));
let mockRxEnabled = false;
jest.mock("../../../src/net/use-order-flags", () => ({ useOrderFlags: () => ({ rxEnabled: mockRxEnabled }) }));
const mockRx = { pages: [] as { id: string; uri: string; key: string | null }[], uploading: false, keys: [] as string[], add: jest.fn(), remove: jest.fn() };
jest.mock("../../../src/query/use-prescription-photos", () => ({ RX_MAX_PAGES: 3, usePrescriptionPhotos: () => mockRx }));

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
  mockOnline = true;
  mockHome = { label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, area: "Belgravia" };
  mockMenu.restaurant.hours = null;
  mockMenu.restaurant.freeDelivery = false;
  mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6)];
  mockCart.cart = { restaurantId: "m1", restaurantName: "Gava’s Kitchen", lines: GAVA.map((l) => ({ ...l })), orderNote: "", venue: null };
  mockParams = {};
  mockSlots = SLOTS;
  mockOwed = 0;
  mockRxEnabled = false;
  mockRx.pages = [];
  mockRx.keys = [];
  mockRx.uploading = false;
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
  });

  it("a 409 from the kitchen speaks the server's reason and refetches the menu", async () => {
    mockPlace.mockRejectedValue(new ApiError(409, "Sadza & beef stew is out of stock right now"));
    const t = render();
    await flush();
    press(t, /^Place order · /);
    await flush();
    expect(texts(t)).toContain("Sadza & beef stew is out of stock right now");
    expect(mockRefetch).toHaveBeenCalled();
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
    act(() => edit.props.onMove({ lat: -18.5, lng: 31.9 }));
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
    shopCart("pharmacy", RX);
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).not.toContain("PRESCRIPTION");
    expect(all).not.toContain("Prescription needed");
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
});
