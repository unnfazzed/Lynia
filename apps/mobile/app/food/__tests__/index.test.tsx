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
import { FlatList } from "react-native";

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
