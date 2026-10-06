/**
 * The boot aggregate answers the first screens' keys (startup review §5 item 11). Home mounts under
 * the splash before `/app/bootstrap` lands; its `["me"]` and `["activeCustomerOrders"]` reads must JOIN
 * the aggregate instead of firing their own requests on the splash's critical path — and still get the
 * right answer from the key's own endpoint when the aggregate can't give it.
 */
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import renderer, { act } from "react-test-renderer";

const mockFetchBootstrap = jest.fn();
jest.mock("../../api/bootstrap", () => ({ fetchBootstrap: () => mockFetchBootstrap() }));
const mockGetMe = jest.fn();
jest.mock("../../api/auth", () => ({ getMe: () => mockGetMe() }));
const mockActiveOrders = jest.fn();
const mockActiveJob = jest.fn();
jest.mock("../../api/orders", () => ({
  getActiveCustomerOrders: () => mockActiveOrders(),
  getActiveOrder: () => mockActiveJob(),
}));

import { __resetBootstrapForTest, startBootstrap, useBootstrap } from "../use-bootstrap";

const customerMe = { profileId: "p1", role: "customer", firstName: "Tendai" };
const riderMe = { profileId: "p2", role: "rider", firstName: "Rudo" };

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A screen's `useQuery` mounting on `key` with its own fetcher, as Home does. */
function screenQuery<T>(qc: QueryClient, key: readonly unknown[], queryFn: () => Promise<T>): QueryObserver<T> {
  const obs = new QueryObserver<T>(qc, { queryKey: key, queryFn });
  obs.subscribe(() => {});
  return obs;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("startBootstrap", () => {
  it("Home's ['me'] and live-orders reads join the in-flight aggregate — no requests of their own", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const boot = deferred<unknown>();
    mockFetchBootstrap.mockReturnValue(boot.promise);
    void startBootstrap(qc, "customer");

    const homeMe = jest.fn(async () => customerMe);
    const homeOrders = jest.fn(async () => []);
    const me = screenQuery(qc, ["me"], homeMe);
    const orders = screenQuery(qc, ["activeCustomerOrders"], homeOrders);

    boot.resolve({ minSupportedVersion: "0.0.0", me: customerMe, activeOrder: null, activeOrders: [{ id: "o1" }] });
    await flush();

    expect(homeMe).not.toHaveBeenCalled();
    expect(homeOrders).not.toHaveBeenCalled();
    expect(mockGetMe).not.toHaveBeenCalled();
    expect(mockActiveOrders).not.toHaveBeenCalled();
    expect(me.getCurrentResult().data).toEqual(customerMe);
    expect(orders.getCurrentResult().data).toEqual([{ id: "o1" }]);
    qc.clear();
  });

  it("falls back to each key's own endpoint when the aggregate fails or an older API lacks the list", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFetchBootstrap.mockRejectedValue(Object.assign(new Error("Network request failed"), { status: 0 }));
    mockGetMe.mockResolvedValue(customerMe);
    mockActiveOrders.mockResolvedValue([{ id: "o2" }]);
    await startBootstrap(qc, "customer").catch(() => undefined);
    await flush();
    expect(qc.getQueryData(["me"])).toEqual(customerMe);
    expect(qc.getQueryData(["activeCustomerOrders"])).toEqual([{ id: "o2" }]);

    const qcOld = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFetchBootstrap.mockResolvedValue({ minSupportedVersion: "0.0.0", me: customerMe, activeOrder: null }); // no activeOrders
    mockActiveOrders.mockResolvedValue([{ id: "o3" }]);
    await startBootstrap(qcOld, "customer");
    await flush();
    expect(qcOld.getQueryData(["activeCustomerOrders"])).toEqual([{ id: "o3" }]);
    qc.clear();
    qcOld.clear();
  });

  it("a rider's hint answers the job key, never the customer list", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFetchBootstrap.mockResolvedValue({ minSupportedVersion: "0.0.0", me: riderMe, activeOrder: { id: "job-1" } });
    await startBootstrap(qc, "rider");
    await flush();
    expect(qc.getQueryData(["me"])).toEqual(riderMe);
    expect(qc.getQueryData(["activeJob"])).toEqual({ id: "job-1" });
    expect(qc.getQueryData(["activeCustomerOrders"])).toBeUndefined();
    expect(mockActiveJob).not.toHaveBeenCalled();
    qc.clear();
  });
});

describe("useBootstrap", () => {
  const session = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer" };

  it("starts from the launch's keychain read — before the session reaches React state — and only once", async () => {
    __resetBootstrapForTest();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFetchBootstrap.mockResolvedValue({ minSupportedVersion: "0.0.0", me: customerMe, activeOrder: null, activeOrders: [] });
    const launch = jest.fn(async () => session);
    function Sync({ s }: { s: typeof session | null }): null {
      useBootstrap(s, launch);
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={qc}>
          <Sync s={null} />
        </QueryClientProvider>,
      );
    });
    await act(flush);
    expect(mockFetchBootstrap).toHaveBeenCalledTimes(1); // the session prop is still null
    // AuthProvider re-renders with the same identity: no second aggregate.
    await act(async () => {
      tree.update(
        <QueryClientProvider client={qc}>
          <Sync s={session} />
        </QueryClientProvider>,
      );
    });
    await act(flush);
    expect(mockFetchBootstrap).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(["me"])).toEqual(customerMe);
    act(() => tree.unmount());
    qc.clear();
  });
});
