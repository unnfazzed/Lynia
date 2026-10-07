import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import type { CustomerBalanceResponse } from "@lynia/shared";
import { type CarriedBalanceState, useCarriedBalance } from "../use-order-flow";

/**
 * U49 (reviewed list 2026-10-07): Review & place may only place once the carried balance was read on THIS
 * visit — never on a cached answer from an earlier one, which can predate a new cancel-after-collection.
 */

const mockGetBalance = jest.fn<Promise<CustomerBalanceResponse>, []>();
jest.mock("../../api/order-flow", () => ({
  getCustomerBalance: () => mockGetBalance(),
  getScheduleSlots: jest.fn(),
}));

function Harness({ onResult }: { onResult: (r: CarriedBalanceState) => void }): null {
  onResult(useCarriedBalance(true));
  return null;
}

const flush = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

function renderHarness(qc: QueryClient): () => CarriedBalanceState {
  let latest: CarriedBalanceState | undefined;
  act(() => {
    create(
      <QueryClientProvider client={qc}>
        <Harness onResult={(r) => (latest = r)} />
      </QueryClientProvider>,
    );
  });
  return () => latest!;
}

const OWES_10: CustomerBalanceResponse = { owedUsd: 10, lines: [{ orderId: "o1", amount: 10, createdAt: "2026-10-07T10:00:00.000Z", carriedOnOrderId: null }] };
const NOTHING: CustomerBalanceResponse = { owedUsd: 0, lines: [] };

function clientWithCached(data: CustomerBalanceResponse): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["orderflow", "balance"], data, { updatedAt: Date.now() - 60_000 });
  return qc;
}

describe("useCarriedBalance (U49)", () => {
  beforeEach(() => mockGetBalance.mockReset());

  it("a cached balance from an earlier visit does not settle — Place waits for this visit's read", async () => {
    let resolve!: (b: CustomerBalanceResponse) => void;
    mockGetBalance.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const latest = renderHarness(clientWithCached(NOTHING));
    await flush();
    expect(latest()).toMatchObject({ settled: false, loading: true, failed: false });
    await act(async () => resolve(OWES_10));
    await flush();
    expect(latest()).toMatchObject({ settled: true, loading: false, failed: false, owed: 10 });
  });

  it("a refetch that fails over a cached answer is a failure, not a settle", async () => {
    mockGetBalance.mockRejectedValueOnce(new Error("offline"));
    const latest = renderHarness(clientWithCached(NOTHING));
    await flush();
    await flush();
    expect(latest()).toMatchObject({ settled: false, loading: false, failed: true });
  });

  it("a fresh read with no cache settles", async () => {
    mockGetBalance.mockResolvedValueOnce(NOTHING);
    const latest = renderHarness(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    await flush();
    await flush();
    expect(latest()).toMatchObject({ settled: true, owed: 0 });
  });
});
