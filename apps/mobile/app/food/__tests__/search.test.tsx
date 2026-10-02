/**
 * Search — Browse v2 X1–X4 (packages/design/handoff/browse-v2, ledger D-57): X1 (recent + Popular near
 * you before typing), X2a (Home results grouped by service, three each with "See all n"), X2b (parcel
 * words bring the Send a parcel row), X3 (a service's search: PLACES + its items only), X4a (no results),
 * X4b (offline: recent searches still work). The scope comes from the route; Home adds each switched-on
 * Shops / Pharmacy section's own search (D-58), and a shop hit opens that section's storefront.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";

jest.useFakeTimers();

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const mockPush = jest.fn();
let mockParams: { scope?: string; q?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../../src/logic/home-location", () => ({
  useHomeLocation: () => ({ label: "12 Lanark Rd", point: { lat: -17.8, lng: 31.05 }, area: "Belgravia", source: "gps", locating: false, denied: false }),
}));
let mockReachable = true;
jest.mock("../../../src/net/use-reachable", () => ({ useReachable: () => mockReachable }));
const mockSaved: string[][] = [];
let mockRecent: string[] = [];
jest.mock("../../../src/logic/recent-searches", () => {
  const actual = jest.requireActual("../../../src/logic/recent-searches");
  return {
    ...actual,
    loadRecentSearches: () => Promise.resolve(mockRecent),
    saveRecentSearches: (l: string[]) => {
      mockSaved.push(l);
      return Promise.resolve();
    },
  };
});

const venue = (id: string, name: string, shopKind?: string) => ({
  id,
  name,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: null,
  location: { lat: -17.81, lng: 31.05 },
  ratingAvg: null,
  ratingCount: 0,
  prepBaselineMinutes: 20,
  ...(shopKind ? { shopKind } : {}),
});
const dish = (n: number, name: string, merchantId: string, merchantName: string) => ({ dishId: `d${n}`, name, priceUsd: 5, photoUrl: null, merchantId, merchantName });
const mockSearch = jest.fn();
const mockPopular = jest.fn();
const mockShopSearch = jest.fn();
let mockFlags = { shopsEnabled: true, pharmacyEnabled: true };
jest.mock("../../../src/net/use-service-flags", () => ({ useServiceFlags: () => mockFlags }));
jest.mock("../../../src/api/shops", () => ({ searchShops: (...a: unknown[]) => mockShopSearch(...a) }));
jest.mock("../../../src/api/restaurants", () => ({
  searchRestaurants: (...a: unknown[]) => mockSearch(...a),
  getSearchPopular: () => mockPopular(),
}));

import SearchScreen from "../search";

const trees: renderer.ReactTestRenderer[] = [];
async function render(params: { scope?: string; q?: string }): Promise<renderer.ReactTestRenderer> {
  mockParams = params;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <SearchScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  trees.push(tree);
  // The 300 ms debounce, then the fetch.
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
}
function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat(Infinity).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}
function press(tree: renderer.ReactTestRenderer, label: string | RegExp): void {
  const node = tree.root.findAll((n) => typeof n.props.onPress === "function" && (typeof label === "string" ? n.props.accessibilityLabel === label : label.test(n.props.accessibilityLabel ?? "")))[0];
  if (!node) throw new Error(`nothing pressable labelled ${String(label)}`);
  act(() => node.props.onPress());
}

beforeEach(() => {
  mockPush.mockClear();
  mockSearch.mockReset();
  mockShopSearch.mockReset();
  mockShopSearch.mockResolvedValue({ shops: [], items: [] });
  mockFlags = { shopsEnabled: true, pharmacyEnabled: true };
  mockPopular.mockReset();
  mockPopular.mockResolvedValue({ terms: ["Roast chicken", "Pizza"] });
  mockSaved.length = 0;
  mockRecent = ["sadza", "brake pads"];
  mockReachable = true;
});
afterEach(() => {
  for (const t of trees.splice(0)) act(() => t.unmount());
});

describe("Search — X1 before typing", () => {
  it("Home shows recent searches and Popular near you; a chip fills the field", async () => {
    const tree = await render({ scope: "all" });
    const all = texts(tree);
    expect(all).toContain("RECENT");
    expect(all).toContain("brake pads");
    expect(all).toContain("POPULAR NEAR YOU");
    expect(all).toContain("Roast chicken");
    expect(mockSearch).not.toHaveBeenCalled();
    press(tree, "Pizza");
    expect(tree.root.findByProps({ returnKeyType: "search" }).props.value).toBe("Pizza");
  });

  it("a service's search has no popular chips", async () => {
    const tree = await render({ scope: "food" });
    expect(texts(tree)).not.toContain("POPULAR NEAR YOU");
    expect(mockPopular).not.toHaveBeenCalled();
  });

  it("Clear forgets every recent search", async () => {
    const tree = await render({ scope: "all" });
    press(tree, "Clear recent");
    expect(mockSaved.at(-1)).toEqual([]);
    expect(texts(tree)).not.toContain("sadza");
  });
});

describe("Search — X2 Home results", () => {
  it("groups by service, three each, and 'See all n' opens the rest", async () => {
    mockSearch.mockResolvedValue({
      restaurants: [venue("r1", "Chicken Slice")],
      dishes: [1, 2, 3, 4, 5].map((n) => dish(n, `Chicken dish ${n}`, "r1", "Chicken Slice")),
    });
    mockShopSearch.mockImplementation((service: string) =>
      Promise.resolve(service === "shops" ? { shops: [venue("s1", "Borrowdale Butchery", "butchery")], items: [] } : { shops: [venue("p1", "Avondale Pharmacy", "pharmacy")], items: [] }),
    );
    const tree = await render({ scope: "all", q: "chicken" });
    expect(mockSearch).toHaveBeenCalledWith("chicken");
    expect(mockShopSearch).toHaveBeenCalledWith("shops", "chicken");
    expect(mockShopSearch).toHaveBeenCalledWith("pharmacy", "chicken");
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(["RESTAURANTS", "SHOPS", "PHARMACY", "DISHES & ITEMS", "See all 5"]));
    // The name is drawn with the match marked, so find the rows by their labels.
    const shown = (): number => new Set(tree.root.findAll((n) => typeof n.props.onPress === "function" && /^Chicken dish \d/.test(n.props.accessibilityLabel ?? "")).map((n) => n.props.accessibilityLabel)).size;
    expect(shown()).toBe(3);
    press(tree, /^See all 5/);
    expect(shown()).toBe(5);
  });

  it("opening a hit goes to its venue and remembers the search", async () => {
    mockSearch.mockResolvedValue({ restaurants: [venue("r1", "Chicken Slice")], dishes: [] });
    const tree = await render({ scope: "all", q: "chicken" });
    press(tree, "Chicken Slice");
    expect(mockPush).toHaveBeenCalledWith("/food/r1");
    expect(mockSaved.at(-1)?.[0]).toBe("chicken");
  });

  it("a shop or pharmacy hit, and an item in one, open that section's storefront", async () => {
    mockSearch.mockResolvedValue({ restaurants: [], dishes: [] });
    mockShopSearch.mockImplementation((service: string) =>
      Promise.resolve(
        service === "shops"
          ? { shops: [venue("s1", "Borrowdale Butchery", "butchery")], items: [] }
          : { shops: [], items: [dish(7, "Paracetamol 500mg", "p1", "Avondale Pharmacy")] },
      ),
    );
    const tree = await render({ scope: "all", q: "para" });
    press(tree, "Borrowdale Butchery");
    expect(mockPush).toHaveBeenLastCalledWith("/shops/s1");
    press(tree, /^Paracetamol 500mg/);
    expect(mockPush).toHaveBeenLastCalledWith("/pharmacy/p1");
  });

  it("a section that is switched off is not searched", async () => {
    mockFlags = { shopsEnabled: true, pharmacyEnabled: false };
    mockSearch.mockResolvedValue({ restaurants: [], dishes: [] });
    await render({ scope: "all", q: "chicken" });
    expect(mockShopSearch).toHaveBeenCalledTimes(1);
    expect(mockShopSearch).toHaveBeenCalledWith("shops", "chicken");
  });

  it("one section failing still shows the others", async () => {
    mockSearch.mockResolvedValue({ restaurants: [venue("r1", "Chicken Slice")], dishes: [] });
    mockShopSearch.mockRejectedValue(new Error("503"));
    const tree = await render({ scope: "all", q: "chicken" });
    expect(texts(tree)).toContain("RESTAURANTS");
  });

  it("parcel words with nothing to buy lead with Send a parcel (X2b)", async () => {
    mockSearch.mockResolvedValue({ restaurants: [], dishes: [] });
    const tree = await render({ scope: "all", q: "documents" });
    expect(texts(tree)).toContain("No restaurants, shops or items match “documents”.");
    press(tree, /^Send a parcel/);
    expect(mockPush).toHaveBeenCalledWith("/send");
  });
});

describe("Search — X3 inside a service", () => {
  it("Restaurants shows PLACES and DISHES, and searches no shops", async () => {
    mockSearch.mockResolvedValue({ restaurants: [venue("r4", "Sadza Republic")], dishes: [dish(1, "Sadza & beef stew", "r1", "Gava’s Kitchen")] });
    const tree = await render({ scope: "food", q: "sadza" });
    expect(mockSearch).toHaveBeenCalledWith("sadza");
    expect(mockShopSearch).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(expect.arrayContaining(["PLACES", "DISHES", "Gava’s Kitchen"]));
  });

  it("an unknown scope falls back to Restaurants", async () => {
    mockSearch.mockResolvedValue({ restaurants: [], dishes: [] });
    await render({ scope: "nope", q: "sadza" });
    expect(mockSearch).toHaveBeenCalledWith("sadza");
    expect(mockShopSearch).not.toHaveBeenCalled();
  });
});

describe("Search — X4", () => {
  it("no results says so (X4a)", async () => {
    mockSearch.mockResolvedValue({ restaurants: [], dishes: [] });
    const tree = await render({ scope: "all", q: "fufu" });
    expect(texts(tree).some((t) => t.includes("“fufu”"))).toBe(true);
  });

  it("offline keeps the recent searches and says search needs a connection (X4b)", async () => {
    mockReachable = false;
    const tree = await render({ scope: "all" });
    const all = texts(tree);
    expect(all).toContain("sadza");
    expect(all).not.toContain("POPULAR NEAR YOU");
  });
});
