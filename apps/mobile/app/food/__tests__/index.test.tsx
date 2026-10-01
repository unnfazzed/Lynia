/**
 * Restaurants list — Browse v2 (packages/design/handoff/browse-v2, ledger D-57): B1, B7, B8, B9,
 * B11, B12, the Sort sheet and the closed group. Also B-T3: `GET /restaurants` has no server-side cap (unlike history/board/notifications, all capped
 * 30-50 rows) — this screen used to render the whole result through a plain ScrollView + `.map()`,
 * mounting every restaurant's cover-photo Image concurrently regardless of catalog size, a real
 * OOM-trajectory shape on a 1-2GB Go-class device as merchant onboarding grows the corridor's
 * catalog. Pins the structural fix (FlatList, so only what's on-screen is mounted) so a future
 * "just add a row here" edit can't quietly revert to an unbounded ScrollView.
 */
import renderer, { act } from "react-test-renderer";
import { renderSync } from "../../../src/testing/render-sync";
import { FlatList, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocationSheet } from "../../../src/ui/home/LocationSheet";

const TEST_METRICS = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// The screen's useNow() runs a 60s interval, which would fire after Jest teardown on the real clock.
jest.useFakeTimers();

const mockRestaurants = Array.from({ length: 40 }, (_, i) => ({
  id: `r-${i}`,
  name: `Restaurant ${i}`,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: i % 2 ? ["Chicken"] : ["Zimbabwean", "Grills"],
  priceLevel: 2,
  hours: null as null | Record<string, { open: string; close: string }>,
  location: { lat: -17.8 + i / 1000, lng: 31.05 },
  ratingAvg: i === 0 ? null : 4.5,
  ratingCount: i === 0 ? 0 : 10 + i,
  prepBaselineMinutes: 20,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// The header's deliver-to is the customer's LIVE location now. Stub the hook rather than
// expo-location so these tests stay about the LIST, and so the hook's async GPS beats can't land
// state updates outside act() once a test has finished asserting.
const mockLocation = {
  label: "22 Bingley Drive",
  point: { lat: -17.8, lng: 31.05 } as { lat: number; lng: number } | null,
  area: "Belgravia" as string | null,
  source: "gps" as const,
  locating: false,
  denied: false,
  useCurrentLocation: jest.fn(),
  setManualPlace: jest.fn(),
};
const resetLocation = () => {
  mockLocation.label = "22 Bingley Drive";
  mockLocation.point = { lat: -17.8, lng: 31.05 };
  mockLocation.area = "Belgravia";
  mockLocation.denied = false;
};
jest.mock("../../../src/logic/home-location", () => ({
  SET_LOCATION_PROMPT: "Set your location",
  useHomeLocation: () => mockLocation,
}));
// Opening the sheet reads the saved Home/Work slots from SecureStore — stub it so these tests stay
// off native storage and land no async setState after the assertions have run.
jest.mock("../../../src/logic/saved-places", () => ({
  loadSaved: () => Promise.resolve({ home: null, work: null }),
}));
jest.mock("../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false }),
}));

// B-O10: `hasMore`/`isLoadingMore`/`loadMore` are new — a mutable stub so individual tests can flip
// `hasMore`/`isLoadingMore` and observe the screen's reaction (onEndReached, the "Open now" auto-drain
// effect, the footer spinner) without re-mocking the whole module per test.
const mockFeedStub = {
  restaurants: mockRestaurants as typeof mockRestaurants | null,
  showingStale: false,
  staleSavedAt: null as string | null,
  isFetching: false,
  isError: false,
  hasLiveData: true,
  refetch: jest.fn(),
  hasMore: false,
  isLoadingMore: false,
  loadMore: jest.fn(),
};
const resetFeedStub = () => {
  mockFeedStub.restaurants = mockRestaurants;
  mockFeedStub.showingStale = false;
  mockFeedStub.isFetching = false;
  mockFeedStub.isError = false;
  mockFeedStub.hasLiveData = true;
  mockFeedStub.hasMore = false;
  mockFeedStub.isLoadingMore = false;
  mockFeedStub.refetch.mockClear();
  mockFeedStub.loadMore.mockClear();
};
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantListFeed: () => mockFeedStub,
}));

import RestaurantListScreen from "../index";

function mount(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <RestaurantListScreen />
      </SafeAreaProvider>,
    );
  });
  return tree;
}
function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat(Infinity).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}
function renderRow(tree: renderer.ReactTestRenderer, index: number): renderer.ReactTestRenderer {
  const list = tree.root.findByType(FlatList);
  return renderSync(<SafeAreaProvider initialMetrics={TEST_METRICS}>{list.props.renderItem({ item: list.props.data[index], index })}</SafeAreaProvider>);
}

beforeEach(() => {
  resetFeedStub();
  resetLocation();
  for (const r of mockRestaurants) r.hours = null;
});

describe("RestaurantListScreen — B1 data", () => {
  it("virtualises the catalogue through one FlatList (B-T3) and keys rows by id", () => {
    const tree = mount();
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(mockRestaurants.length);
    expect(list.props.keyExtractor(list.props.data[0])).toBe(list.props.data[0].key);
  });

  it("draws the first two results as full cards and the rest as compact rows, nearest first", () => {
    const tree = mount();
    const data = tree.root.findByType(FlatList).props.data as Array<{ kind: string; v?: { id: string } }>;
    expect(data.slice(0, 3).map((e) => e.kind)).toEqual(["full", "full", "row"]);
    // Recommended falls back to nearest-open (no ranking yet, README §7): r-0 is the closest.
    expect(data[0]!.v!.id).toBe("r-0");
  });

  it("puts closed venues in a 'Closed now' group at the end instead of hiding them", () => {
    const closedAllWeek = {};
    mockRestaurants[0]!.hours = closedAllWeek;
    mockRestaurants[1]!.hours = closedAllWeek;
    const tree = mount();
    const data = tree.root.findByType(FlatList).props.data as Array<{ kind: string; v?: { id: string } }>;
    expect(data).toHaveLength(mockRestaurants.length + 1);
    const at = data.findIndex((e) => e.kind === "closed");
    expect(at).toBe(mockRestaurants.length - 2);
    expect(data.slice(at + 1).map((e) => e.v!.id)).toEqual(["r-0", "r-1"]);
    expect(texts(renderRow(tree, at))).toContain("Closed now");
  });

  it("shows an unrated venue as 'New', never a zero star", () => {
    const tree = mount();
    expect(texts(renderRow(tree, 0))).toContain("New");
  });

  it("heads the list with the count and the time range, under the address the home shares", () => {
    const tree = mount();
    const all = texts(tree);
    expect(all).toContain("22 Bingley Drive, Belgravia");
    expect(all).toContain("40 places");
    expect(all.some((t) => /^\d+–\d+ min$/.test(t))).toBe(true);
    expect(all).toContain("Sort: Recommended");
  });

  it("opens the same location sheet the home header opens", () => {
    const tree = mount();
    const control = tree.root.findAll((n) => typeof n.props.onPress === "function" && (n.props.accessibilityLabel ?? "").startsWith("DELIVERING TO"))[0]!;
    act(() => control.props.onPress());
    expect(tree.root.findByType(LocationSheet).props.visible).toBe(true);
  });
});

describe("RestaurantListScreen — B7 no location", () => {
  it("shows the mint card and no fee, time or distance", () => {
    mockLocation.point = null;
    const tree = mount();
    const all = texts(tree);
    expect(all).toContain("Where should we deliver?");
    expect(all).toContain("in Harare");
    const row = texts(renderRow(tree, 3));
    expect(row.some((t) => /km|delivery|min/.test(t))).toBe(false);
  });
});

describe("RestaurantListScreen — first load, failure, empty", () => {
  it("B8: the real header over a skeleton, no list", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isFetching = true;
    const tree = mount();
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    expect(texts(tree)).toContain("Restaurants");
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === "Loading").length).toBeGreaterThan(0);
  });

  it("B11: couldn't load, with ↻ Try again calling refetch", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isError = true;
    const tree = mount();
    expect(texts(tree)).toContain("Couldn’t load restaurants");
    const retry = tree.root.findAll((n) => n.props.accessibilityLabel === "↻ Try again" && typeof n.props.onPress === "function")[0]!;
    act(() => retry.props.onPress());
    expect(mockFeedStub.refetch).toHaveBeenCalledTimes(1);
  });

  it("B9: a successful load with nothing in the corridor names the area", () => {
    mockFeedStub.restaurants = [];
    const tree = mount();
    expect(texts(tree)).toContain("No restaurants deliver to Belgravia yet");
  });
});

describe("RestaurantListScreen — paging", () => {
  it("requests the next page near the end while more exist, and not after", () => {
    mockFeedStub.hasMore = true;
    let tree = mount();
    act(() => tree.root.findByType(FlatList).props.onEndReached());
    expect(mockFeedStub.loadMore).toHaveBeenCalledTimes(1);
    mockFeedStub.hasMore = false;
    mockFeedStub.loadMore.mockClear();
    tree = mount();
    act(() => tree.root.findByType(FlatList).props.onEndReached());
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled();
  });

  it("B12: 'Loading more…' while a page is in flight, then the end-of-list line", () => {
    mockFeedStub.hasMore = true;
    mockFeedStub.isLoadingMore = true;
    let tree = mount();
    expect(texts(renderSync(<SafeAreaProvider initialMetrics={TEST_METRICS}>{tree.root.findByType(FlatList).props.ListFooterComponent}</SafeAreaProvider>))).toContain("Loading more…");
    mockFeedStub.hasMore = false;
    mockFeedStub.isLoadingMore = false;
    tree = mount();
    expect(texts(renderSync(<SafeAreaProvider initialMetrics={TEST_METRICS}>{tree.root.findByType(FlatList).props.ListFooterComponent}</SafeAreaProvider>))).toContain("That’s all 40 restaurants delivering to Belgravia.");
  });
});

describe("RestaurantListScreen — B5 Sort sheet", () => {
  it("greys out the distance sorts without a location", () => {
    mockLocation.point = null;
    const tree = mount();
    const sort = tree.root.findAll((n) => n.props.accessibilityLabel === "Sort: Recommended" && typeof n.props.onPress === "function")[0]!;
    act(() => sort.props.onPress());
    const disabled = tree.root.findAll((n) => n.props.accessibilityRole === "radio" && n.props.accessibilityState?.disabled === true && typeof n.props.onPress === "function");
    const names = new Set(disabled.map((n) => n.findAllByType(Text)[0]!.props.children as string));
    expect([...names]).toEqual(["Nearest", "Lowest delivery fee"]);
    expect(disabled.every((n) => n.props.accessibilityHint === "Set your location to use this")).toBe(true);
  });
});
