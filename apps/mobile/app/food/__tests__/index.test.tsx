/**
 * B-T3: `GET /restaurants` has no server-side cap (unlike history/board/notifications, all capped
 * 30-50 rows) — this screen used to render the whole result through a plain ScrollView + `.map()`,
 * mounting every restaurant's cover-photo Image concurrently regardless of catalog size, a real
 * OOM-trajectory shape on a 1-2GB Go-class device as merchant onboarding grows the corridor's
 * catalog. Pins the structural fix (FlatList, so only what's on-screen is mounted) so a future
 * "just add a row here" edit can't quietly revert to an unbounded ScrollView.
 */
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, FlatList, Text } from "react-native";
import { Banner, EmptyState, Skeleton } from "../../../src/ui";
import { LocationSheet } from "../../../src/ui/home/LocationSheet";

// The adopted RC.list_loading view renders <Skeleton/>, whose Animated pulse is an infinite loop, and
// the screen's useNow() runs a 60s interval — both would fire after Jest teardown on the real clock.
// Fake timers keep every scheduled callback off the real clock (same pattern as auction-clock.test).
jest.useFakeTimers();

const mockRestaurants = Array.from({ length: 40 }, (_, i) => ({
  id: `r-${i}`,
  name: `Restaurant ${i}`,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: null,
  location: null,
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
  mockFeedStub.refetch.mockClear();
};
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantListFeed: () => mockFeedStub,
}));

import RestaurantListScreen from "../index";

describe("RestaurantListScreen (B-T3: unbounded catalog must be virtualized, not ScrollView+map)", () => {
  it("renders the restaurant list via FlatList, not an unvirtualized ScrollView", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });

    // FlatList's own internal ScrollView is expected (that's how virtualization scrolls) — the
    // regression this pins is a screen-level `.map()` handing FlatList's full backing array to it
    // instead of rendering every row directly as JSX children, which findByType would fail below.
    // findByType (singular) throws unless exactly one match exists, which is the assertion itself.
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(mockRestaurants.length);
  });

  it("still renders every restaurant's row content (virtualization must not drop data)", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    const list = tree.root.findByType(FlatList);
    // FlatList renders lazily under react-test-renderer too (VirtualizedList windows by default),
    // so assert the full backing dataset was handed to it rather than requiring every row painted.
    expect(list.props.data.map((r: { id: string }) => r.id)).toEqual(mockRestaurants.map((r) => r.id));
    const first = mockRestaurants[0]!;
    expect(list.props.keyExtractor(first)).toBe(first.id);
  });
});

describe("RestaurantListScreen (RC.list_loading: cold load renders the adopted skeleton view, not the list)", () => {
  // The generated loading view renders <Skeleton/>, whose Animated pulse is an infinite loop — unmount
  // every tree so the timer's cleanup fires and no animation leaks past Jest teardown.
  let tree: renderer.ReactTestRenderer | null = null;
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
    // Restore the shared stub to its data state for the rest of the suite.
    mockFeedStub.restaurants = mockRestaurants;
    mockFeedStub.isFetching = false;
  });

  it("renders FoodListLoadingView's content skeletons and no FlatList on a cold load (no data yet)", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isFetching = true;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    // The generated RC.list_loading view is a full-screen content skeleton — Skeletons present…
    expect(tree!.root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    // …and the data-state FlatList must NOT mount (findAllByType returns [] rather than throwing).
    expect(tree!.root.findAllByType(FlatList)).toHaveLength(0);
  });

  it("does NOT show the cold skeleton once a stale copy exists (header + list render instead)", () => {
    // showingStale means feed.restaurants is the stale copy — data exists, so loading must not take over.
    mockFeedStub.restaurants = mockRestaurants;
    mockFeedStub.isFetching = true;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    expect(tree!.root.findByType(FlatList).props.data).toHaveLength(mockRestaurants.length);
  });
});

describe("RestaurantListScreen (RC.list_error: cold fetch failure renders the adopted offline view)", () => {
  let tree: renderer.ReactTestRenderer | null = null;
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
    resetFeedStub();
  });

  it("renders FoodListErrorView (offline Banner + retry EmptyState) and no FlatList on a cold error", () => {
    // Cold error: the fetch settled in error with NO data (not even a stale copy).
    mockFeedStub.restaurants = null;
    mockFeedStub.isError = true;
    mockFeedStub.isFetching = false;
    mockFeedStub.hasLiveData = false;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    // The adopted RC.list_error view draws the mock's offline Banner slot + the retry EmptyState…
    expect(tree!.root.findAllByType(Banner).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByType(EmptyState).length).toBeGreaterThan(0);
    // …and the data-state FlatList must NOT mount.
    expect(tree!.root.findAllByType(FlatList)).toHaveLength(0);
  });

  it("preserves retry behavior — the EmptyState's Try again button calls feed.refetch", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isError = true;
    mockFeedStub.isFetching = false;
    mockFeedStub.hasLiveData = false;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    act(() => {
      tree!.root.findByProps({ label: "Try again" }).props.onPress();
    });
    expect(mockFeedStub.refetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT show the cold error view when a stale copy exists (list + inline retry render instead)", () => {
    // showingStale means feed.restaurants is the stale copy — data exists, so the error screen must not
    // take over; the honest 'showing what we had' path keeps the list.
    mockFeedStub.restaurants = mockRestaurants;
    mockFeedStub.showingStale = true;
    mockFeedStub.isError = true;
    mockFeedStub.hasLiveData = false;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    expect(tree!.root.findByType(FlatList).props.data).toHaveLength(mockRestaurants.length);
    expect(tree!.root.findAllByType(Banner)).toHaveLength(0);
  });
});

describe("RestaurantListScreen (B-O10: GET /restaurants is now cursor-paginated)", () => {
  beforeEach(() => {
    mockFeedStub.hasMore = false;
    mockFeedStub.isLoadingMore = false;
    mockFeedStub.loadMore.mockClear();
  });

  it("requests the next page when the list scrolls near the end and more pages exist", () => {
    mockFeedStub.hasMore = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    act(() => {
      tree.root.findByType(FlatList).props.onEndReached();
    });
    expect(mockFeedStub.loadMore).toHaveBeenCalledTimes(1);
  });

  it("does not request another page once the catalog is exhausted", () => {
    mockFeedStub.hasMore = false;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    act(() => {
      tree.root.findByType(FlatList).props.onEndReached();
    });
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled();
  });

  it("shows a footer spinner while the next page is in flight", () => {
    mockFeedStub.hasMore = true;
    mockFeedStub.isLoadingMore = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    const footer = tree.root.findByType(FlatList).props.ListFooterComponent;
    expect(renderer.create(footer).root.findByType(ActivityIndicator)).toBeTruthy();
  });

  it('auto-drains remaining pages once "Open now" is toggled on, so the filter never under-reports', () => {
    mockFeedStub.hasMore = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled(); // not filtering yet — no reason to drain
    act(() => {
      tree.root.findByProps({ accessibilityLabel: "Open now filter" }).props.onPress();
    });
    expect(mockFeedStub.loadMore).toHaveBeenCalled();
  });
});

/**
 * RC.list header parity (`r-customer-a.jsx:89`). The mock draws a PRECISE street address under the
 * "FOOD · DELIVER TO" overline with a chevron-down picker beside it, four filter/sort pills, and a
 * results summary naming the suburb. The app drew a hardcoded "Harare", no chevron, one pill and no
 * summary — the same hardcode `home-location.ts` was written to kill on the home header.
 *
 * These pin the wiring, not the pixels: that the address comes from the live location rather than a
 * literal, that every drawn pill exists and is honest about whether it can answer, and that the
 * summary describes what is actually on screen.
 */
describe("RestaurantListScreen (RC.list header: live deliver-to, four pills, results summary)", () => {
  beforeEach(() => {
    resetFeedStub();
    resetLocation();
    mockFeedStub.hasMore = false;
    mockFeedStub.isLoadingMore = false;
    mockFeedStub.loadMore.mockClear();
  });

  const allText = (tree: renderer.ReactTestRenderer): string =>
    tree.root
      .findAllByType(Text)
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children ?? "")))
      .join("\n");

  it("draws the customer's live address, never the hardcoded 'Harare'", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    const text = allText(tree);
    expect(text).toContain("FOOD · DELIVER TO");
    expect(text).toContain("22 Bingley Drive, Belgravia"); // street qualified by suburb, as RC.list draws it
    // The regression this whole change exists to prevent.
    expect(text).not.toContain("Harare");
  });

  it("opens the same location sheet the home header opens when the deliver-to is tapped", async () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    expect(tree.root.findByType(LocationSheet).props.visible).toBe(false);
    // Async act: opening the sheet kicks off its saved-places load, which must settle inside act().
    await act(async () => {
      tree.root.findAllByProps({ accessibilityLabel: "Deliver to 22 Bingley Drive, Belgravia. Change location" })[0]!.props.onPress();
    });
    expect(tree.root.findByType(LocationSheet).props.visible).toBe(true);
    // A pick writes through the shared slot, so home and food can never disagree about the address.
    expect(tree.root.findByType(LocationSheet).props.onPick).toBe(mockLocation.setManualPlace);
  });

  it("renders all four pills the mock draws, not just 'Open now'", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    const text = allText(tree);
    for (const label of ["Open now", "Nearest", "Under $2 fee", "Top rated"]) expect(text).toContain(label);
  });

  it("summarises the results and names the suburb the customer is in", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    // 40 stub restaurants, none carrying a location — so the count lands and the ETA clause is
    // dropped rather than invented.
    expect(allText(tree)).toContain("40 places deliver to Belgravia");
  });

  it("disables the distance-dependent pills (and drops the suburb) when there is no fix", () => {
    mockLocation.point = null;
    mockLocation.area = null;
    mockLocation.label = "Set your location";
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    const stateOf = (label: string) => tree.root.findAllByProps({ accessibilityLabel: label })[0]!.props.accessibilityState;
    expect(stateOf("Sort by nearest").disabled).toBe(true);
    expect(stateOf("Under $2 delivery fee filter").disabled).toBe(true);
    // Rating needs no geometry, and Open now reads `hours` — both still work.
    expect(stateOf("Sort by top rated").disabled).toBe(false);
    expect(stateOf("Open now filter").disabled).toBe(false);
    expect(allText(tree)).toContain("40 places deliver here");
  });

  /**
   * REGRESSION (caught by the parity render lane, not by these tests): the header's derived state
   * lives in `useMemo`s, and they were originally written BELOW the screen's three state-dependent
   * early returns (flag-off / cold-loading / cold-error). A hook after an early return runs on the
   * data frame but not on the loading frame, so React saw the hook COUNT grow between renders and
   * tore the whole screen down — "Rendered more hooks than during the previous render", i.e. a BLANK
   * screen on the completely ordinary cold-load → data transition every user hits on app open.
   *
   * Every other test here renders ONE fixed state, which is exactly why none of them caught it. This
   * one drives the transition.
   */
  it("survives the cold-load → data transition (hooks must not be declared after an early return)", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isFetching = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    // Cold frame: the adopted skeleton, no header yet.
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);

    // Data lands — the SAME mounted component now takes the full render path.
    mockFeedStub.restaurants = mockRestaurants;
    mockFeedStub.isFetching = false;
    act(() => {
      tree.update(<RestaurantListScreen />);
    });
    expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
    expect(allText(tree)).toContain("22 Bingley Drive");
  });

  it("survives the cold-error → data transition too", () => {
    mockFeedStub.restaurants = null;
    mockFeedStub.isError = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    mockFeedStub.restaurants = mockRestaurants;
    mockFeedStub.isError = false;
    act(() => {
      tree.update(<RestaurantListScreen />);
    });
    expect(allText(tree)).toContain("FOOD · DELIVER TO");
  });

  it("drains remaining pages for a SORT too — 'Nearest' over page one is not the nearest", () => {
    mockFeedStub.hasMore = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantListScreen />);
    });
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled();
    act(() => {
      tree.root.findAllByProps({ accessibilityLabel: "Sort by nearest" })[0]!.props.onPress();
    });
    expect(mockFeedStub.loadMore).toHaveBeenCalled();
  });
});
