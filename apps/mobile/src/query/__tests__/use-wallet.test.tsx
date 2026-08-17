import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import type { WalletEntry, WalletLedgerPage } from "@lynia/shared";
import { useWalletLedger } from "../use-wallet";

const mockGetWalletLedger = jest.fn<Promise<WalletLedgerPage>, [string | undefined]>();
jest.mock("../../api/wallet", () => ({
  getWalletLedger: (cursor?: string) => mockGetWalletLedger(cursor),
}));

function entry(id: string): WalletEntry {
  return { id, type: "commission", title: "Commission", meta: "10% of $3.00", amount: -0.3, balanceAfter: 4.7, createdAt: "2026-08-01T00:00:00.000Z" };
}

type HookResult = ReturnType<typeof useWalletLedger>;

function Harness({ onResult }: { onResult: (r: HookResult) => void }): null {
  const result = useWalletLedger();
  onResult(result);
  return null;
}

/** Observer notifications are scheduled through setTimeout(0) (notifyManager) — flush them. */
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

// LC-B-SIB-2: `getWalletLedger`'s `nextCursor` was returned by the API but never read anywhere in the
// mobile app — the rider Money tab always called `useWalletLedger()` with no cursor, so a rider with
// more than the server's 25-entry page size (`LEDGER_PAGE_SIZE`) permanently lost visibility into
// older deductions with zero on-screen signal anything was missing. This pins the new `loadMore()`
// path: it must actually request the second page with the first page's cursor and accumulate (not
// replace) entries, and `hasMore` must go false once the server stops returning a cursor.
describe("useWalletLedger pagination (LC-B-SIB-2)", () => {
  beforeEach(() => {
    mockGetWalletLedger.mockReset();
  });

  it("loads the first page with no cursor and exposes hasMore when the server returns one", async () => {
    mockGetWalletLedger.mockResolvedValueOnce({ entries: [entry("a"), entry("b")], nextCursor: "cursor-1" });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    expect(mockGetWalletLedger).toHaveBeenCalledWith(undefined);
    expect(latest().entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(latest().hasMore).toBe(true);
  });

  it("loadMore() fetches the next page with the prior page's cursor and ACCUMULATES entries", async () => {
    mockGetWalletLedger.mockResolvedValueOnce({ entries: [entry("a"), entry("b")], nextCursor: "cursor-1" });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    mockGetWalletLedger.mockResolvedValueOnce({ entries: [entry("c"), entry("d")], nextCursor: undefined });
    await act(async () => {
      latest().loadMore();
    });
    await flushNotifications();
    await flushNotifications();

    expect(mockGetWalletLedger).toHaveBeenLastCalledWith("cursor-1");
    // Both pages' entries are visible together — a prior page is never discarded/replaced.
    expect(latest().entries.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    // The server sent no further cursor, so there is nothing left to page into.
    expect(latest().hasMore).toBe(false);
  });

  it("hasMore is false when the very first page already has no nextCursor", async () => {
    mockGetWalletLedger.mockResolvedValueOnce({ entries: [entry("a")], nextCursor: undefined });
    const { latest } = renderHarness();
    await flushNotifications();
    await flushNotifications();

    expect(latest().hasMore).toBe(false);
  });
});
