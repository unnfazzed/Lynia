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
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useNavigation: () => ({ setOptions: () => undefined }), Redirect: () => null }));
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

type Line = { dishId: string; name: string; priceUsd: number; quantity: number; note: string };
const mockCart = {
  ready: true,
  cart: { restaurantId: "m1" as string | null, restaurantName: "Gava’s Kitchen" as string | null, lines: [] as Line[], orderNote: "" },
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
  mockMenu.categories[0]!.dishes = [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6)];
  mockCart.cart = { restaurantId: "m1", restaurantName: "Gava’s Kitchen", lines: GAVA.map((l) => ({ ...l })), orderNote: "" };
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
    // Schedule needs the slots API (R5) — no dead half of the segmented control.
    expect(all).not.toContain("Schedule");
    // Cash only (BRIEF §14).
    expect(all.join(" ")).not.toMatch(/wallet|mobile money|ecocash|innbucks/i);
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
    expect(mockRouter.replace).toHaveBeenCalledWith("/food/order/fo-9");
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

  it("R6b — the kitchen just closed: a sheet, nothing ordered, See open places", async () => {
    mockMenu.restaurant.hours = {}; // a configured week with no open day: closed now
    const t = render();
    await flush();
    const all = texts(t);
    expect(all).toContain("Gava’s Kitchen just closed");
    expect(all).toContain("See open places");
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
    mockCart.cart = { restaurantId: null, restaurantName: null, lines: [], orderNote: "" };
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
