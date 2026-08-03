/**
 * B-O1: history was a ScrollView + `.map()` over the full (server-capped 50-row) trip history,
 * mounting every row concurrently regardless of how many are actually on-screen — the same
 * render-cost shape B-T3/LC-B07 already fixed for the (uncapped) restaurant catalog. Pins the
 * structural fix (FlatList, so only what's on-screen is mounted) so a future "just add a row here"
 * edit can't quietly revert to an unbounded ScrollView.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { FlatList } from "react-native";
import type { OrderHistoryRow } from "../../../src/api/orders";

const mockRows: OrderHistoryRow[] = Array.from({ length: 40 }, (_, i) => ({
  id: `o-${i}`,
  orderType: "parcel",
  merchantName: null,
  role: "customer",
  pickup: { point: { lat: 0, lng: 0 }, landmark: `Pickup ${i}` },
  dropoff: { point: { lat: 0, lng: 0 }, landmark: `Drop ${i}` },
  itemDesc: "Documents",
  note: null,
  proposedFare: "5.00",
  agreedFare: "5.00",
  status: "delivered",
  createdAt: new Date().toISOString(),
  rating: null,
  counterpartyName: null,
}));

const mockUseHistoryFeed = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock("../../../src/query/use-history-feed", () => ({
  useHistoryFeed: () => mockUseHistoryFeed(),
}));

import HistoryScreen from "../index";

describe("HistoryScreen (B-O1: capped-but-still-multi-row list must be virtualized, not ScrollView+map)", () => {
  beforeEach(() => {
    mockUseHistoryFeed.mockReturnValue({
      rows: mockRows,
      showingStale: false,
      isFetching: false,
      isError: false,
      hasLiveData: true,
      refetch: jest.fn(),
    });
  });

  it("renders trips via FlatList, not an unvirtualized ScrollView", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryScreen />);
    });

    // findByType (singular) throws unless exactly one match exists — the regression this pins is a
    // screen-level `.map()` handing FlatList's full backing array to it as JSX children instead.
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(mockRows.length);
  });

  it("still hands every trip to the list (virtualization must not drop data)", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HistoryScreen />);
    });
    const list = tree.root.findByType(FlatList);
    expect(list.props.data.map((r: OrderHistoryRow) => r.id)).toEqual(mockRows.map((r) => r.id));
    const first = mockRows[0]!;
    expect(list.props.keyExtractor(first)).toBe(first.id);
  });
});
