import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../../api/client";

const mockGetCustomerOrders = jest.fn();
const mockGetHistory = jest.fn();
jest.mock("../../api/orders", () => ({
  getCustomerOrders: (...a: unknown[]) => mockGetCustomerOrders(...a),
  getHistory: (...a: unknown[]) => mockGetHistory(...a),
}));

import { CUSTOMER_ORDERS_KEY, type CustomerOrdersFeed, useCustomerOrders } from "../use-customer-orders";

/** The Orders tab feed (Orders v2, ledger D-63): GET /orders/mine/history, paged by cursor. */

let feed: CustomerOrdersFeed | null = null;
function Probe(): null {
  feed = useCustomerOrders();
  return null;
}
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
async function mount(): Promise<renderer.ReactTestRenderer> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await flush();
  return t;
}

afterEach(() => {
  feed = null;
  jest.clearAllMocks();
});

it("lives under the history key, so every history invalidation refreshes it", () => {
  expect(CUSTOMER_ORDERS_KEY).toEqual(["history", "customer"]);
});

it("pages by the server's cursor and stops when it runs out", async () => {
  mockGetCustomerOrders.mockResolvedValueOnce({ rows: [{ id: "a" }], nextCursor: "c1" }).mockResolvedValueOnce({ rows: [{ id: "b" }], nextCursor: null });
  const t = await mount();
  expect(feed!.rows!.map((r) => r.id)).toEqual(["a"]);
  expect(feed!.hasMore).toBe(true);
  await act(async () => {
    await feed!.loadMore();
  });
  await flush();
  expect(mockGetCustomerOrders).toHaveBeenLastCalledWith("c1");
  expect(feed!.rows!.map((r) => r.id)).toEqual(["a", "b"]);
  expect(feed!.hasMore).toBe(false);
  act(() => t.unmount());
});

it("an API without the endpoint (404) falls back to the legacy feed as one page", async () => {
  mockGetCustomerOrders.mockRejectedValue(new ApiError(404, "Not found"));
  mockGetHistory.mockResolvedValue([{ id: "legacy" }]);
  const t = await mount();
  expect(feed!.rows!.map((r) => r.id)).toEqual(["legacy"]);
  expect(feed!.hasMore).toBe(false);
  act(() => t.unmount());
});
