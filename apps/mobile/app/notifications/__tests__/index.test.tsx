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
  // Distinct, descending timestamps — the shape the server actually returns (newest first). Identical
  // times would make any position assertion vacuous, since a stable sort can't distinguish them.
  at: new Date(Date.UTC(2026, 7, 17, 12, 0) - i * 60_000).toISOString(),
  unread: false,
}));

const mockGetNotificationsFeed = jest.fn();
const mockMarkNotificationsRead = jest.fn();
const mockDismissNotification = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  // STREAMLINE-01: the screen stamps the read watermark on focus. Same immediate-invoke stub the other
  // focus-effect suites use (app/__tests__/send.test.tsx, rider (tabs) index) — under the test renderer
  // there is no navigator to fire a real focus event.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(cb, []);
  },
}));
jest.mock("../../../src/api/notifications", () => ({
  getNotificationsFeed: (...args: unknown[]) => mockGetNotificationsFeed(...args),
  markNotificationsRead: (...args: unknown[]) => mockMarkNotificationsRead(...args),
  dismissNotification: (...args: unknown[]) => mockDismissNotification(...args),
}));

import NotificationsScreen from "../index";

/** The client the most recent renderScreen() built — lets a test read the cache the screen writes. */
let currentQc: QueryClient;

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  currentQc = qc;
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

/**
 * The view node the container drives. Located by the presence of its dismissal callback rather than by
 * component type, so this stays valid if the generated view is re-emitted under a different local name.
 */
function dismissVia(tree: renderer.ReactTestRenderer): (index: number) => void {
  const node = tree.root.findAll((n) => typeof n.props?.onItemDismiss === "function")[0];
  if (!node) throw new Error("no node exposes onItemDismiss — the container stopped wiring dismissal");
  return node.props.onItemDismiss as (index: number) => void;
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
    mockMarkNotificationsRead.mockReset();
    mockMarkNotificationsRead.mockResolvedValue({ readAt: new Date().toISOString() });
    mockDismissNotification.mockReset();
    mockDismissNotification.mockResolvedValue({ ok: true });
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

/**
 * STREAMLINE-01. Two behaviours that are invisible from the row markup and easy to regress:
 *
 *  1. Opening the screen is what marks the feed read. `unread` is a server-side watermark now, so if this
 *     call is ever dropped the dots (and the Account row's "N new" hint) never clear at all — the old
 *     recency proxy hid that class of bug by expiring on its own after 24h.
 *  2. A dismissal must leave the list UNDER THE FINGER and be rolled back if the write fails, or a
 *     notification the server will keep sending appears to have been dealt with.
 */
describe("NotificationsScreen — STREAMLINE-01 read state + dismissal", () => {
  beforeEach(() => {
    mockGetNotificationsFeed.mockReset();
    mockGetNotificationsFeed.mockResolvedValue(mockRows);
    mockMarkNotificationsRead.mockReset();
    mockMarkNotificationsRead.mockResolvedValue({ readAt: new Date().toISOString() });
    mockDismissNotification.mockReset();
    mockDismissNotification.mockResolvedValue({ ok: true });
  });

  it("stamps the read watermark when the screen gains focus", async () => {
    renderScreen();
    await settle();
    expect(mockMarkNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("still renders when the read stamp fails (best-effort: rows stay unread, the screen stays up)", async () => {
    mockMarkNotificationsRead.mockRejectedValue(new Error("offline"));
    const tree = renderScreen();
    await settle();
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(mockRows.length);
  });

  it("dismisses a row optimistically and posts the row's own synthetic id", async () => {
    const tree = renderScreen();
    await settle();

    // Drive the dismissal through the view's own contract rather than simulating a pan gesture: the
    // container is what owns the optimistic removal, and that is what this pins.
    const dismiss = dismissVia(tree);
    await act(async () => {
      dismiss(1);
    });
    // react-query batches cache notifications on a timer, so the optimistic write needs one tick to
    // reach the render — not a round-trip: `dismissNotification` has already been called by this point.
    expect(mockDismissNotification).toHaveBeenCalledWith(mockRows[1]!.id);
    await settle();
    // The row is gone from the list immediately, without waiting for a refetch.
    const ids = tree.root.findByType(FlatList).props.data.map((n: NotificationRow) => n.id);
    expect(ids).not.toContain(mockRows[1]!.id);
    expect(ids).toHaveLength(mockRows.length - 1);
  });

  it("restores the row when BOTH the dismiss write and the recovery refetch fail", async () => {
    const tree = renderScreen();
    await settle();
    // Both requests fail for the same reason a real one would — the connection is gone. Without the
    // restore, the optimistic filter would survive and hide a notification the server never dismissed.
    mockDismissNotification.mockRejectedValue(new Error("offline"));
    mockGetNotificationsFeed.mockRejectedValue(new Error("offline"));

    const dismiss = dismissVia(tree);
    await act(async () => {
      dismiss(2);
    });
    await settle();

    // Asserted on the CACHE, not the tree: a failed refetch puts the query in its error state, so the
    // screen swaps the list for the retry branch. The guarantee under test is that the row is back in
    // the cache the retry will paint from — otherwise it would stay filtered out for the whole session.
    const cached = currentQc.getQueryData<NotificationRow[]>(["notifications"]) ?? [];
    const ids = cached.map((n) => n.id);
    expect(ids).toContain(mockRows[2]!.id);
    // …back in its original position, not appended to the end (rows are newest-first by `at`).
    expect(ids).toEqual(mockRows.map((n) => n.id));
  });

  it("rolls the row back by refetching when the dismiss write fails", async () => {
    mockDismissNotification.mockRejectedValue(new Error("offline"));
    const tree = renderScreen();
    await settle();
    expect(mockGetNotificationsFeed).toHaveBeenCalledTimes(1);

    const dismiss = dismissVia(tree);
    await act(async () => {
      dismiss(0);
    });
    await settle();

    // A failed dismissal refetches, so the row the server still considers live comes back.
    expect(mockGetNotificationsFeed).toHaveBeenCalledTimes(2);
  });
});
