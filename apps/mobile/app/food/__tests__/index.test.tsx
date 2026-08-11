/**
 * B-T3: `GET /restaurants` has no server-side cap (unlike history/board/notifications, all capped
 * 30-50 rows) — this screen used to render the whole result through a plain ScrollView + `.map()`,
 * mounting every restaurant's cover-photo Image concurrently regardless of catalog size, a real
 * OOM-trajectory shape on a 1-2GB Go-class device as merchant onboarding grows the corridor's
 * catalog. Pins the structural fix (FlatList, so only what's on-screen is mounted) so a future
 * "just add a row here" edit can't quietly revert to an unbounded ScrollView.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, FlatList } from "react-native";
import { Banner, EmptyState, Skeleton } from "../../../src/ui";

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
