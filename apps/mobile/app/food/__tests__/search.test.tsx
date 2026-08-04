/**
 * B-T3: same unbounded-catalog risk as food/index.tsx (see that test's header comment) — search
 * results are filtered client-side from the same uncapped `useRestaurantListFeed` list, so a broad
 * query (or a large corridor catalog) used to mount every matching row's Image concurrently via
 * ScrollView + `.map()`. Pins the FlatList conversion.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FlatList } from "react-native";

const mockRestaurants = Array.from({ length: 30 }, (_, i) => ({
  id: `r-${i}`,
  name: `Sadza Spot ${i}`,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: ["sadza"],
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
// B-O10: mutable stub, same rationale as index.test.tsx's — lets pagination tests below flip
// `hasMore`/`isLoadingMore` per case.
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
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantListFeed: () => mockFeedStub,
}));

import RestaurantSearchScreen from "../search";

describe("RestaurantSearchScreen (B-T3: unbounded match set must be virtualized, not ScrollView+map)", () => {
  beforeEach(() => {
    mockFeedStub.hasMore = false;
    mockFeedStub.isLoadingMore = false;
    mockFeedStub.loadMore.mockClear();
  });

  it("renders matching results via FlatList, not an unvirtualized ScrollView", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantSearchScreen />);
    });
    act(() => {
      tree.root.findByProps({ placeholder: "Search restaurants or cuisine" }).props.onChangeText("sadza");
    });

    // findByType (singular) throws unless exactly one match exists, which is the assertion itself.
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(mockRestaurants.length);
  });
});

describe("RestaurantSearchScreen (B-O10: search must drain every page, not just the first)", () => {
  beforeEach(() => {
    mockFeedStub.hasMore = false;
    mockFeedStub.isLoadingMore = false;
    mockFeedStub.loadMore.mockClear();
  });

  it("does not fetch more pages while the search box is empty", () => {
    mockFeedStub.hasMore = true;
    act(() => {
      renderer.create(<RestaurantSearchScreen />);
    });
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled();
  });

  it("auto-drains remaining pages as soon as a query is typed, so a match past page 1 isn't missed", () => {
    mockFeedStub.hasMore = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantSearchScreen />);
    });
    act(() => {
      tree.root.findByProps({ placeholder: "Search restaurants or cuisine" }).props.onChangeText("sadza");
    });
    expect(mockFeedStub.loadMore).toHaveBeenCalled();
  });

  it("stops draining once the catalog is exhausted", () => {
    mockFeedStub.hasMore = false;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RestaurantSearchScreen />);
    });
    act(() => {
      tree.root.findByProps({ placeholder: "Search restaurants or cuisine" }).props.onChangeText("sadza");
    });
    expect(mockFeedStub.loadMore).not.toHaveBeenCalled();
  });
});
