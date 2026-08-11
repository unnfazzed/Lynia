import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import type { RestaurantListResponse } from "@lynia/shared";
import { useRestaurantListFeed } from "../use-restaurants";

const mockGetRestaurants = jest.fn<Promise<RestaurantListResponse>, [string | undefined]>();
jest.mock("../../api/restaurants", () => ({
  getRestaurants: (cursor?: string) => mockGetRestaurants(cursor),
  getRestaurantMenu: jest.fn(),
}));

function restaurant(id: string) {
  return { id, name: `Kitchen ${id}`, coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: null, hours: null, location: null, ratingAvg: null, ratingCount: 0, prepBaselineMinutes: null };
}

type HookResult = ReturnType<typeof useRestaurantListFeed>;

function Harness({ onResult }: { onResult: (r: HookResult) => void }): null {
  const result = useRestaurantListFeed(true);
  onResult(result);
  return null;
}

/** Observer notifications are scheduled through setTimeout(0) (notifyManager) — flush them (matches
 *  use-wallet.test.tsx's identical `useInfiniteQuery` harness convention). */
const flushNotifications = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

function renderHarness(): { latest: () => HookResult; unmount: () => void } {
  let latest: HookResult | undefined;
  const qc = new QueryClient();
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <QueryClientProvider client={qc}>
        <Harness onResult={(r) => (latest = r)} />
      </QueryClientProvider>,
    );
  });
  return { latest: () => latest!, unmount: () => root.unmount() };
}

// B-O10: `GET /restaurants` is now cursor-paginated (was one unbounded fetch). Pins the new
// `loadMore()`/`hasMore` surface: it must request the second page with the first page's cursor and
// ACCUMULATE restaurants (matching `useWalletLedger`'s pinned behavior for the identical shape).
describe("useRestaurantListFeed pagination (B-O10)", () => {
  beforeEach(() => {
    mockGetRestaurants.mockReset();
  });

  it("loads the first page with no cursor and exposes hasMore when the server returns one", async () => {
    mockGetRestaurants.mockResolvedValueOnce({ restaurants: [restaurant("a"), restaurant("b")], nextCursor: "cursor-1" });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    expect(mockGetRestaurants).toHaveBeenCalledWith(undefined);
    expect(latest().restaurants?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(latest().hasMore).toBe(true);
  });

  it("loadMore() fetches the next page with the prior page's cursor and ACCUMULATES restaurants", async () => {
    mockGetRestaurants.mockResolvedValueOnce({ restaurants: [restaurant("a"), restaurant("b")], nextCursor: "cursor-1" });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    mockGetRestaurants.mockResolvedValueOnce({ restaurants: [restaurant("c"), restaurant("d")], nextCursor: undefined });
    await act(async () => {
      latest().loadMore();
    });
    await flushNotifications();
    await flushNotifications();

    expect(mockGetRestaurants).toHaveBeenLastCalledWith("cursor-1");
    // Both pages' restaurants are visible together — a prior page is never discarded/replaced.
    expect(latest().restaurants?.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    // The server sent no further cursor, so there is nothing left to page into.
    expect(latest().hasMore).toBe(false);
  });

  it("hasMore is false when the very first page already has no nextCursor", async () => {
    mockGetRestaurants.mockResolvedValueOnce({ restaurants: [restaurant("a")], nextCursor: undefined });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    expect(latest().hasMore).toBe(false);
  });
});
