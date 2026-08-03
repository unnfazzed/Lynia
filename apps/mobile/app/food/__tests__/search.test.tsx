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
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantListFeed: () => ({
    restaurants: mockRestaurants,
    showingStale: false,
    staleSavedAt: null,
    isFetching: false,
    isError: false,
    hasLiveData: true,
    refetch: jest.fn(),
  }),
}));

import RestaurantSearchScreen from "../search";

describe("RestaurantSearchScreen (B-T3: unbounded match set must be virtualized, not ScrollView+map)", () => {
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
