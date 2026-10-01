/**
 * Shops & Pharmacy (Browse v2 B2–B4, S3–S4; ledger D-58): the list and storefront in each section's
 * skin, browse-only until Order flow v2 — no +, no cart bar, an item sheet with nothing to add.
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
let mockCatalogue: unknown = {
  shop: shop("s-1", "Avondale Pharmacy", "pharmacy"),
  categories: [{ id: "c-1", name: "Pain & fever", availableFrom: null, availableTo: null, dishes: [item("d-1", "Paracetamol 500mg (20 tabs)", 1.5), item("d-2", "Ibuprofen 200mg (24 tabs)", 2.2)] }],
};
jest.mock("../../../query/use-shops", () => ({
  useShopListFeed: () => mockFeed,
  useShopCatalogue: () => ({ catalogue: mockCatalogue, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
}));

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
  jest.clearAllMocks();
});

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

describe("Pharmacy storefront (S4), browse only", () => {
  it("lists items as rows with the OTC notice and no way to add", () => {
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    const t = texts(tree);
    expect(t).toContain("Avondale Pharmacy");
    expect(t).toContain("Packed in ~10 min");
    expect(t).toContain("Paracetamol 500mg (20 tabs)");
    expect(t).toContain("$1.50");
    expect(t).toContain("Over-the-counter only.");
    expect(tree.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Add ")).length).toBe(0);
  });

  it("an item opens the sheet with its details and no Add button", () => {
    tree = mount(<ShopStoreScreen service="pharmacy" />);
    const row = tree.root.find((n) => n.props.accessibilityLabel === "Paracetamol 500mg (20 tabs), $1.50" && typeof n.props.onPress === "function");
    act(() => row.props.onPress());
    const t = texts(tree);
    expect(t).not.toMatch(/Add · \$/);
    expect(t).not.toContain("Note for the pharmacy");
  });
});

describe("Shop storefront (S3)", () => {
  it("lays items out as price-first tiles", () => {
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
  });
});
