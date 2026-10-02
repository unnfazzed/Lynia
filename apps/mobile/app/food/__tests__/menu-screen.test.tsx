/**
 * Restaurant storefront — Browse v2 (packages/design/handoff/browse-v2, ledger D-57): S1 (info strip,
 * Popular rail, tabs), S5/S6 (steppers + the forest cart bar with the small-order hint), S8 (closed:
 * no + anywhere), S10 (a category outside its serving window), I1 (row → item sheet), I3 (a cart from
 * another kitchen is asked about BEFORE anything is cleared).
 */
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";
import { ItemSheet, NewCartSheet } from "../../../src/ui/browse/sheets";

// The screen's clock ticks every 60s; fake timers keep it off the real clock after teardown.
jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "m1" }),
}));

const dish = (id: string, name: string, priceUsd: number, extra: object = {}) => ({ id, name, description: null, priceUsd, photoUrl: null, outOfStock: false, ...extra });
const mockMenu = {
  restaurant: {
    id: "m1",
    name: "Gava’s Kitchen",
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: ["Zimbabwean", "Grills"],
    priceLevel: 2,
    hours: null as null | Record<string, never>,
    location: { lat: -17.81, lng: 31.05 },
    ratingAvg: 4.7,
    ratingCount: 210,
    prepBaselineMinutes: 20,
  },
  categories: [
    { id: "c0", name: "Breakfast", availableFrom: "00:00", availableTo: "00:00", dishes: [dish("d0", "Full breakfast", 4)] },
    { id: "c1", name: "Mains", availableFrom: null, availableTo: null, dishes: [dish("d1", "Sadza & beef stew", 4.5), dish("d2", "Roast chicken (half)", 6), dish("d3", "T-bone & sadza", 8.5, { outOfStock: true })] },
  ],
  popularDishIds: ["d1", "d2"],
};
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantMenu: () => ({ menu: mockMenu, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useReopenReminder: () => ({ isSet: false, isPending: false, isLoading: false, toggle: jest.fn() }),
}));
jest.mock("../../../src/logic/home-location", () => ({
  useHomeLocation: () => ({ label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, area: "Belgravia", source: "gps", locating: false, denied: false }),
}));

type Line = { dishId: string; name: string; priceUsd: number; quantity: number; note: string };
const mockCart = {
  cart: { restaurantId: "m1" as string | null, restaurantName: "Gava’s Kitchen" as string | null, lines: [] as Line[], orderNote: "" },
  itemCount: 0,
  subtotal: 0,
  smallOrderFee: 0,
  total: 0,
  addItem: jest.fn(() => false),
  setQuantity: jest.fn(),
  removeItem: jest.fn(),
  replaceLines: jest.fn(),
  clear: jest.fn(),
};
function setCart(restaurantId: string | null, name: string | null, lines: Line[]): void {
  mockCart.cart = { restaurantId, restaurantName: name, lines, orderNote: "" };
  mockCart.itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  mockCart.subtotal = lines.reduce((s, l) => s + l.quantity * l.priceUsd, 0);
}
jest.mock("../../../src/food/cart-context", () => ({ useFoodCart: () => mockCart }));
let mockSlots: unknown = undefined;
jest.mock("../../../src/query/use-order-flow", () => ({ useScheduleSlots: () => ({ slots: mockSlots, isLoading: false, isError: false }) }));

import RestaurantMenuScreen from "../[id]";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <RestaurantMenuScreen />
      </SafeAreaProvider>,
    );
  });
  return tree;
}
function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat(Infinity).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}
function press(tree: renderer.ReactTestRenderer, label: string | RegExp): void {
  const node = tree.root.findAll((n) => typeof n.props.onPress === "function" && (typeof label === "string" ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel ?? "")))[0];
  if (!node) throw new Error(`nothing pressable labelled ${String(label)}`);
  act(() => node.props.onPress({ stopPropagation: () => undefined }));
}

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  mockCart.addItem.mockClear();
  mockCart.setQuantity.mockClear();
  mockCart.clear.mockClear();
  mockMenu.restaurant.hours = null;
  setCart("m1", "Gava’s Kitchen", []);
  mockSlots = undefined;
});

describe("Storefront — S1", () => {
  it("answers how good, how long, how much and how far above the fold", () => {
    const all = texts(render());
    expect(all).toContain("Gava’s Kitchen");
    expect(all).toContain("Zimbabwean · Grills · $$");
    expect(all).toContain("4.7");
    expect(all).toContain("210 ratings");
    expect(all).toContain("$1.50");
    expect(all).toContain("Ready in ~20 min");
  });

  it("leads with the Popular rail when the kitchen has the history for it", () => {
    const tabs = render().root.findAll((n) => n.props.accessibilityRole === "tab" && typeof n.props.onPress === "function");
    expect([...new Set(tabs.map((t) => t.findAllByType(Text)[0]!.props.children))]).toEqual(["Popular", "Breakfast", "Mains"]);
  });

  it("goes back from the cover's back disc", () => {
    const tree = render();
    press(tree, "Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("Storefront — adding", () => {
  it("+ adds one straight away, no sheet", () => {
    const tree = render();
    press(tree, "Add Roast chicken (half)");
    expect(mockCart.addItem).toHaveBeenCalledWith("m1", "Gava’s Kitchen", { dishId: "d2", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: "" }, { businessType: "restaurant", shopKind: null });
    expect(tree.root.findByType(ItemSheet).props.item).toBeNull();
  });

  it("tapping the row opens the item sheet (I1)", () => {
    const tree = render();
    press(tree, /^T-bone & sadza, \$8\.50/);
    expect(tree.root.findByType(ItemSheet).props.item).toMatchObject({ id: "d3", unavailable: true });
  });

  it("an out-of-stock dish and a category outside its window have no + (S10)", () => {
    const tree = render();
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Add T-bone & sadza")).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Add Full breakfast")).toHaveLength(0);
    const all = texts(tree);
    expect(all).toContain("Out of stock today");
    expect(all).toContain("Served 00:00–00:00");
  });

  it("asks before replacing another kitchen's cart (I3), and only clears on 'Start new cart'", () => {
    setCart("m9", "Mbare Auto Spares", [{ dishId: "x", name: "Brake pads (front)", priceUsd: 24, quantity: 1, note: "" }]);
    const tree = render();
    press(tree, "Add Roast chicken (half)");
    expect(mockCart.addItem).not.toHaveBeenCalled();
    const sheet = tree.root.findByType(NewCartSheet);
    expect(sheet.props.pending).toMatchObject({ oldVenue: "Mbare Auto Spares", oldCount: 1, oldTotal: 24, item: "Roast chicken (half)", newVenue: "Gava’s Kitchen" });
    expect(texts(tree)).toContain("Your cart from Mbare Auto Spares (1 items, $24.00) will be cleared.");
    press(tree, "Keep my cart");
    expect(mockCart.clear).not.toHaveBeenCalled();
    press(tree, "Add Roast chicken (half)");
    press(tree, "Start new cart");
    expect(mockCart.clear).toHaveBeenCalledTimes(1);
    expect(mockCart.addItem).toHaveBeenCalledTimes(1);
  });
});

describe("Storefront — cart bar", () => {
  it("under $4.00 says how much more skips the small-order fee, and opens the cart", () => {
    setCart("m1", "Gava’s Kitchen", [{ dishId: "d0", name: "Chips", priceUsd: 3.3, quantity: 1, note: "" }]);
    const tree = render();
    expect(texts(tree)).toContain("Add $0.70 to skip the $1.00 small-order fee");
    expect(texts(tree)).toContain("1 item · $3.30");
    press(tree, /View cart$/);
    expect(mockPush).toHaveBeenCalledWith("/food/checkout");
  });

  it("a dish in the cart shows its count and a stepper; − at one removes it", () => {
    setCart("m1", "Gava’s Kitchen", [{ dishId: "d2", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: "" }]);
    const tree = render();
    press(tree, "Remove Roast chicken (half)");
    expect(mockCart.setQuantity).toHaveBeenCalledWith("d2", "", 0);
  });
});

describe("Storefront — closed (S8)", () => {
  it("keeps prices and photos but draws no + anywhere, with Remind me", () => {
    mockMenu.restaurant.hours = {};
    const tree = render();
    expect(tree.root.findAll((n) => (n.props.accessibilityLabel ?? "").startsWith("Add "))).toHaveLength(0);
    const all = texts(tree);
    expect(all).toContain("Closed now");
    expect(all).toContain("Remind me when they open");
    expect(all).toContain("$4.50");
  });
});

describe("Storefront — closed with a basket (R5c, Order flow v2)", () => {
  const slot = (start: string, label: string, full = false) => ({ start, end: start, label, full });
  it("the cart bar orders for when they open — the first slot — and opens Review on it", () => {
    mockMenu.restaurant.hours = {};
    setCart("m1", "Gava’s Kitchen", [{ dishId: "d1", name: "Sadza & beef stew", priceUsd: 7.5, quantity: 1, note: "" }, { dishId: "d2", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: "" }]);
    const first = slot("2026-10-03T08:30:00.000Z", "10:30–11:00");
    mockSlots = { slotMinutes: 30, openNow: false, leadMinutes: 35, today: { date: "2026-10-02", slots: [] }, tomorrow: { date: "2026-10-03", slots: [first] }, firstAvailable: first };
    const tree = render();
    const all = texts(tree);
    expect(all).toContain("2 items · $13.50");
    expect(all).toContain("Order for when they open · 10:30–11:00");
    expect(all).toContain("Review");
    press(tree, /Order for when they open/);
    expect(mockPush).toHaveBeenCalledWith("/food/checkout?schedule=first");
  });

  it("adds carry the venue kind, so Review knows it's a kitchen", () => {
    const tree = render();
    press(tree, "Add Roast chicken (half)");
    expect(mockCart.addItem).toHaveBeenCalledWith("m1", "Gava’s Kitchen", expect.objectContaining({ dishId: "d2" }), { businessType: "restaurant", shopKind: null });
  });
});
