/**
 * Shops & Pharmacy (Browse v2 B2–B4, S3–S4; ledger D-58): the list and storefront in each section's
 * skin, with ordering from Order flow v2 (ledger D-59): +, stepper, item sheet, cart bar, "Start a new
 * cart?", the closed shop's "Order for when they open" (R5c) and the Rx tag behind its flag.
 */
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

jest.useFakeTimers();

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: "s-1" }),
}));
jest.mock("../../../logic/home-location", () => ({
  SET_LOCATION_PROMPT: "Set your location",
  useHomeLocation: () => ({
    label: "12 Lanark Rd",
    point: { lat: -17.8, lng: 31.05 },
    area: "Belgravia",
    source: "gps",
    locating: false,
    denied: false,
    useCurrentLocation: jest.fn(),
    setManualPlace: jest.fn(),
  }),
}));
jest.mock("../../../logic/saved-places", () => ({ loadSaved: () => Promise.resolve({ home: null, work: null }) }));

let mockFlags = { shopsEnabled: true, pharmacyEnabled: true };
jest.mock("../../../net/use-service-flags", () => ({ useServiceFlags: () => mockFlags }));

const shop = (id: string, name: string, shopKind: string) => ({
  id,
  name,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: null,
  location: { lat: -17.8, lng: 31.06 },
  ratingAvg: 4.6,
  ratingCount: 128,
  prepBaselineMinutes: 10,
  shopKind,
});
const mockFeed = {
  shops: [shop("s-1", "Avondale Fresh", "grocery"), shop("s-2", "Mbare Spares", "auto_parts"), shop("s-3", "Kopje Kicks", "fashion")] as unknown[] | null,
  showingStale: false,
  staleSavedAt: null,
  isFetching: false,
  isError: false,
  hasLiveData: true,
  refetch: jest.fn(),
  hasMore: false,
  isLoadingMore: false,
  loadMore: jest.fn(),
};
const item = (id: string, name: string, priceUsd: number) => ({ id, name, description: null, priceUsd, photoUrl: null, outOfStock: false });
const PHARMACY = {
  shop: shop("s-1", "Avondale Pharmacy", "pharmacy"),
  categories: [{ id: "c-1", name: "Pain & fever", availableFrom: null, availableTo: null, dishes: [item("d-1", "Paracetamol 500mg (20 tabs)", 1.5), item("d-2", "Ibuprofen 200mg (24 tabs)", 2.2)] }],
};
let mockCatalogue: unknown = PHARMACY;
jest.mock("../../../query/use-shops", () => ({
  useShopListFeed: () => mockFeed,
  useShopCatalogue: () => ({ catalogue: mockCatalogue, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
}));

type Line = { dishId: string; name: string; priceUsd: number; quantity: number; note: string };
const mockCart = {
  ready: true,
  cart: { restaurantId: null as string | null, restaurantName: null as string | null, lines: [] as Line[], orderNote: "" },
  itemCount: 0,
  subtotal: 0,
  addItem: jest.fn(() => false),
  setQuantity: jest.fn(),
  clear: jest.fn(),
};
function setCart(restaurantId: string | null, name: string | null, lines: Line[]): void {
  mockCart.cart = { restaurantId, restaurantName: name, lines, orderNote: "" };
  mockCart.itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  mockCart.subtotal = lines.reduce((n, l) => n + l.quantity * l.priceUsd, 0);
}
jest.mock("../../../food/cart-context", () => ({ useFoodCart: () => mockCart }));
let mockSlots: unknown = undefined;
jest.mock("../../../query/use-order-flow", () => ({ useScheduleSlots: () => ({ slots: mockSlots, isLoading: false, isError: false }) }));
let mockRxEnabled = false;
jest.mock("../../../net/use-order-flags", () => ({ useOrderFlags: () => ({ rxEnabled: mockRxEnabled }) }));

import { ShopListScreen } from "../ShopListScreen";
import { ShopStoreScreen } from "../ShopStoreScreen";

function mount(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SafeAreaProvider initialMetrics={TEST_METRICS}>{el}</SafeAreaProvider>);
  });
  return tree;
}
function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat(Infinity).filter((c) => typeof c === "string" || typeof c === "number").join(""))
    .join("\n");
}

let tree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  mockFlags = { shopsEnabled: true, pharmacyEnabled: true };
  mockSlots = undefined;
  mockRxEnabled = false;
  setCart(null, null, []);
  mockCatalogue = PHARMACY;
  jest.clearAllMocks();
});
function pressable(t: renderer.ReactTestRenderer, label: string | RegExp) {
  return t.root.findAll(
    (n) => typeof n.props.onPress === "function" && (typeof label === "string" ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel ?? "")),
  )[0];
}
function press(t: renderer.ReactTestRenderer, label: string | RegExp): void {
  const node = pressable(t, label);
  if (!node) throw new Error(`nothing pressable labelled ${String(label)}`);
  act(() => node.props.onPress({ stopPropagation: () => undefined }));
}

describe("Shops list (B2)", () => {
  it("draws the Shops header and the shops, each under its kind", () => {
    tree = mount(<ShopListScreen service="shops" />);
    const t = texts(tree);
    expect(t).toContain("Shops");
    expect(t).toContain("3 places");
    expect(t).toContain("Avondale Fresh");
    expect(t).toContain("Grocery");
    expect(t).not.toContain("Shops are coming soon");
    expect(t).not.toContain("Over-the-counter only.");
  });

  it("switched off by its server flag: the notify-me sheet (B13)", () => {
    mockFlags = { shopsEnabled: false, pharmacyEnabled: true };
    tree = mount(<ShopListScreen service="shops" />);
    expect(texts(tree)).toContain("Shops are coming soon");
  });
});

describe("Pharmacy list (B4)", () => {
  it("carries the OTC notice under its header", () => {
    tree = mount(<ShopListScreen service="pharmacy" />);
    const t = texts(tree);
    expect(t).toContain("Pharmacy");
    expect(t).toContain("Over-the-counter only.");
    expect(t).toContain("No prescription medicine yet.");
  });
});

describe("Pharmacy storefront (S4) — ordering (Order flow v2, D-59)", () => {
  it("lists items as rows with the OTC notice and a + on each", () => {
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    const t = texts(tree);
    expect(t).toContain("Avondale Pharmacy");
    expect(t).toContain("Packed in ~10 min");
    expect(t).toContain("Paracetamol 500mg (20 tabs)");
    expect(t).toContain("$1.50");
    expect(t).toContain("Over-the-counter only.");
    expect(pressable(tree, "Add Paracetamol 500mg (20 tabs)")).toBeTruthy();
  });

  it("+ adds one with the venue's kind; the row opens the sheet with Note for the pharmacy and Add · $x", () => {
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    press(tree, "Add Paracetamol 500mg (20 tabs)");
    expect(mockCart.addItem).toHaveBeenCalledWith(
      "s-1",
      "Avondale Pharmacy",
      { dishId: "d-1", name: "Paracetamol 500mg (20 tabs)", priceUsd: 1.5, quantity: 1, note: "" },
      { businessType: "shop", shopKind: "pharmacy" },
    );
    press(tree, "Paracetamol 500mg (20 tabs), $1.50");
    const t = texts(tree);
    expect(t).toContain("Note for the pharmacy");
    expect(t).toContain("Add · $1.50");
  });

  it("asks before replacing another venue's cart (I3)", () => {
    setCart("m-9", "Gava’s Kitchen", [{ dishId: "x", name: "Sadza", priceUsd: 4.5, quantity: 2, note: "" }]);
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    press(tree, "Add Paracetamol 500mg (20 tabs)");
    expect(mockCart.addItem).not.toHaveBeenCalled();
    expect(texts(tree)).toContain("Start a new cart?");
    press(tree, "Start new cart");
    expect(mockCart.clear).toHaveBeenCalled();
    expect(mockCart.addItem).toHaveBeenCalledTimes(1);
  });

  it("in the cart: the count on the +, a stepper, and the cart bar opens Review", () => {
    setCart("s-1", "Avondale Pharmacy", [{ dishId: "d-1", name: "Paracetamol 500mg (20 tabs)", priceUsd: 1.5, quantity: 2, note: "" }]);
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    const t = texts(tree);
    expect(t).toContain("2 items · $3.00");
    expect(pressable(tree, "One less Paracetamol 500mg (20 tabs)")).toBeTruthy();
    press(tree, /View cart$/);
    expect(mockPush).toHaveBeenCalledWith("/food/checkout");
  });

  it("section switched off: browse only — no +, no Add in the sheet, no cart bar", () => {
    mockFlags = { shopsEnabled: true, pharmacyEnabled: false };
    setCart("s-1", "Avondale Pharmacy", [{ dishId: "d-1", name: "Paracetamol 500mg (20 tabs)", priceUsd: 1.5, quantity: 1, note: "" }]);
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Add ")).length).toBe(0);
    expect(texts(tree)).not.toContain("1 item · $1.50");
    press(tree, "Paracetamol 500mg (20 tabs), $1.50");
    expect(texts(tree)).not.toMatch(/Add · \$/);
  });

  it("rxEnabled: an Rx item wears Prescription needed and carries it into the cart; off, nothing", () => {
    mockCatalogue = {
      shop: shop("s-1", "Avondale Pharmacy", "pharmacy"),
      categories: [{ id: "c-1", name: "Antibiotics", availableFrom: null, availableTo: null, dishes: [{ ...item("d-3", "Amoxicillin 500mg (21 caps)", 4.2), rxRequired: true }] }],
    };
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    expect(texts(tree)).not.toContain("Prescription needed");
    act(() => tree!.unmount());
    mockRxEnabled = true;
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    expect(texts(tree)).toContain("Prescription needed");
    press(tree, /^Add Amoxicillin/);
    expect(mockCart.addItem).toHaveBeenCalledWith("s-1", "Avondale Pharmacy", expect.objectContaining({ dishId: "d-3", rxRequired: true }), { businessType: "shop", shopKind: "pharmacy" });
  });
});

describe("Shop storefront (S3)", () => {
  it("lays items out as price-first tiles with the + inside the photo", () => {
    mockCatalogue = {
      shop: shop("s-1", "Avondale Fresh", "grocery"),
      categories: [{ id: "c-1", name: "Bakery & eggs", availableFrom: null, availableTo: null, dishes: [item("d-1", "Brown bread 700g", 1.2), item("d-2", "Eggs (tray of 30)", 5)] }],
    };
    tree = mount(<ShopStoreScreen service="shops" />);
    const t = texts(tree);
    expect(t).toContain("Avondale Fresh");
    expect(t).toContain("Brown bread 700g");
    expect(t).toContain("$5.00");
    expect(t).not.toContain("Over-the-counter only.");
    press(tree, "Add Eggs (tray of 30)");
    expect(mockCart.addItem).toHaveBeenCalledWith("s-1", "Avondale Fresh", expect.objectContaining({ dishId: "d-2" }), { businessType: "shop", shopKind: "grocery" });
  });

  it("R5c — closed with a basket: no +, and the bar orders for when they open", () => {
    mockCatalogue = {
      shop: { ...shop("s-1", "Avondale Fresh", "grocery"), hours: {} },
      categories: [{ id: "c-1", name: "Bakery & eggs", availableFrom: null, availableTo: null, dishes: [item("d-1", "Brown bread 700g", 1.2)] }],
    };
    setCart("s-1", "Avondale Fresh", [{ dishId: "d-1", name: "Brown bread 700g", priceUsd: 1.2, quantity: 5, note: "" }]);
    const first = { start: "2026-10-03T08:30:00.000Z", end: "2026-10-03T09:00:00.000Z", label: "10:30–11:00", full: false };
    mockSlots = { slotMinutes: 30, openNow: false, leadMinutes: 20, today: { date: "2026-10-02", slots: [] }, tomorrow: { date: "2026-10-03", slots: [first] }, firstAvailable: first };
    tree = mount(<ShopStoreScreen service="shops" />);
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Add ")).length).toBe(0);
    expect(texts(tree)).toContain("Order for when they open · 10:30–11:00");
    press(tree, /Order for when they open/);
    expect(mockPush).toHaveBeenCalledWith("/food/checkout?schedule=first");
  });
});
