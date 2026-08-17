import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

function renderHarness(qc: QueryClient = new QueryClient()): { latest: () => HookResult; unmount: () => void } {
  let latest: HookResult | undefined;
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

/** A QueryClient carrying a "hydrated" restaurants entry, the way PersistQueryClientProvider restores
 *  `rq-cache.json` before home's first render — same infinite-query shape, original `dataUpdatedAt`. */
function hydratedClient(savedAtMs: number, ids: string[]): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(
    ["restaurants"],
    { pages: [{ restaurants: ids.map(restaurant), nextCursor: undefined }], pageParams: [undefined] },
    { updatedAt: savedAtMs },
  );
  return qc;
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

// RCA 2026-08-17 §5.2: the feed warm-paints through the persisted query cache (persist.ts allowlist)
// instead of the deleted per-feature SecureStore snapshot. These pin the D-19 stale-banner contract
// as derived from query state: hydrated data paints in the FIRST render as stale-with-timestamp,
// a confirmed fetch flips it live, and a failed revalidation keeps the (still-honest) stale copy.
describe("useRestaurantListFeed warm paint over the persisted cache", () => {
  const SAVED_AT = new Date("2026-08-17T09:30:00Z").getTime();

  beforeEach(() => {
    mockGetRestaurants.mockReset();
  });

  it("paints hydrated restaurants in the FIRST render, marked stale with the original saved-at time", () => {
    // Never resolves — the first frame must not depend on the network answering.
    mockGetRestaurants.mockReturnValue(new Promise(() => {}));
    const { latest } = renderHarness(hydratedClient(SAVED_AT, ["a", "b"]));

    expect(latest().restaurants?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(latest().showingStale).toBe(true);
    expect(latest().staleSavedAt).toBe(new Date(SAVED_AT).toISOString());
    expect(latest().hasLiveData).toBe(false);
  });

  it("a successful revalidation replaces the hydrated copy and clears the stale banner", async () => {
    mockGetRestaurants.mockResolvedValue({ restaurants: [restaurant("fresh")], nextCursor: undefined });
    const { latest } = renderHarness(hydratedClient(SAVED_AT, ["a"]));
    await flushNotifications();
    await flushNotifications();

    expect(latest().restaurants?.map((r) => r.id)).toEqual(["fresh"]);
    expect(latest().showingStale).toBe(false);
    expect(latest().staleSavedAt).toBeNull();
    expect(latest().hasLiveData).toBe(true);
  });

  it("a FAILED revalidation keeps the hydrated copy on screen, stale banner up, isError set", async () => {
    mockGetRestaurants.mockRejectedValue(new Error("2G dropped"));
    const { latest } = renderHarness(hydratedClient(SAVED_AT, ["a", "b"]));
    await flushNotifications();
    await flushNotifications();

    // The customer keeps seeing what we had — never a data-losing error screen over a warm cache.
    expect(latest().restaurants?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(latest().showingStale).toBe(true);
    expect(latest().isError).toBe(true);
    expect(latest().hasLiveData).toBe(false);
  });

  it("cold start with nothing persisted is unchanged: null restaurants while the first fetch runs", () => {
    mockGetRestaurants.mockReturnValue(new Promise(() => {}));
    const { latest } = renderHarness(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    expect(latest().restaurants).toBeNull();
    expect(latest().showingStale).toBe(false);
    expect(latest().staleSavedAt).toBeNull();
  });
});
