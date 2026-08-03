/**
 * B-O1: notifications was a ScrollView + `.map()` over the full (server-capped 30-row) feed,
 * mounting every row concurrently regardless of how many are actually on-screen — the same
 * render-cost shape B-T3/LC-B07 already fixed for the (uncapped) restaurant catalog. Pins the
 * structural fix (FlatList, so only what's on-screen is mounted) so a future "just add a row here"
 * edit can't quietly revert to an unbounded ScrollView.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlatList } from "react-native";
import type { NotificationRow } from "../../../src/api/notifications";

const mockRows: NotificationRow[] = Array.from({ length: 35 }, (_, i) => ({
  id: `n-${i}`,
  orderId: `o-${i}`,
  status: "delivered",
  icon: "bell",
  title: `Notification ${i}`,
  message: "Your delivery update.",
  at: new Date().toISOString(),
  unread: false,
}));

const mockGetNotificationsFeed = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("../../../src/api/notifications", () => ({
  getNotificationsFeed: (...args: unknown[]) => mockGetNotificationsFeed(...args),
}));

import NotificationsScreen from "../index";

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <NotificationsScreen />
      </QueryClientProvider>,
    );
  });
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("NotificationsScreen (B-O1: capped-but-still-multi-row list must be virtualized, not ScrollView+map)", () => {
  beforeEach(() => {
    mockGetNotificationsFeed.mockReset();
    mockGetNotificationsFeed.mockResolvedValue(mockRows);
  });

  it("renders the feed via FlatList, not an unvirtualized ScrollView", async () => {
    const tree = renderScreen();
    await settle();

    // findByType (singular) throws unless exactly one match exists — the regression this pins is a
    // screen-level `.map()` handing FlatList's full backing array to it as JSX children instead.
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(mockRows.length);
  });

  it("still hands every notification to the list (virtualization must not drop data)", async () => {
    const tree = renderScreen();
    await settle();
    const list = tree.root.findByType(FlatList);
    expect(list.props.data.map((n: NotificationRow) => n.id)).toEqual(mockRows.map((n) => n.id));
    const first = mockRows[0]!;
    expect(list.props.keyExtractor(first)).toBe(first.id);
  });
});
