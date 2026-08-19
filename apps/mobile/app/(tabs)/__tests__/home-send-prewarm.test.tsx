/**
 * PERF-SEND-01 (second half) — the `/send` route is warmed from the launcher's IDLE time, and never
 * from its import graph.
 *
 * expo-router loads route components lazily (`useScreens` passes `getComponent`), so `/send`'s module
 * graph — 57 modules / ~140 KB of minified JS that no other screen pulls in, 29 of them
 * react-native-maps + expo-location — used to be evaluated synchronously inside the "Send" tap
 * handler. That is why the first tap of a session is the slow one and later taps are not. Warming it
 * after interactions moves that evaluation off the tap path.
 *
 * Two properties are pinned here and BOTH are invisible in ordinary use:
 *   1. the route is not reached from Home's import graph — a re-added top-level `import` would drag
 *      all 57 modules back into the launch graph and re-open MOB-BOOT-03's "87.5% of the bundle ran
 *      before the first frame";
 *   2. it IS evaluated once the interaction lands, so the warming actually happens.
 *
 * The mock factory records EVALUATIONS, not calls: a jest.mock factory body runs on the first
 * `require` of that module and never if the module is never reached.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { controlInteractions, type InteractionControl } from "../../../src/testing/interactions";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

let mockSendRouteEvaluated = false;
const mockRequireSendRoute = jest.fn();
jest.mock("../../send", () => {
  mockSendRouteEvaluated = true;
  mockRequireSendRoute();
  return { __esModule: true, default: (): null => null };
});

// Home warms three routes, not one (src/boot/prewarm-routes.ts): `send`, `order` and `foodOrder`.
// This file is about /send, and the other two are stubbed so draining the warm chain here does not
// really evaluate two more live-tracking graphs — react-native-maps, socket.io-client and the rest —
// against this file's deliberately minimal mock surface. Their own coverage is prewarm-routes.test.tsx.
jest.mock("../../order/[id]", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../food/order/[orderId]", () => ({ __esModule: true, default: (): null => null }));

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => cb(), []);
  },
}));

jest.mock("../../../src/api/orders", () => ({
  getActiveCustomerOrders: async () => [],
}));

jest.mock("../../../src/net/use-feature-flags", () => ({
  useFeatureFlags: () => ({ restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false }),
}));

import LauncherHomeScreen from "../home";

/**
 * Property 1, captured at FILE LOAD — the line above is the whole of Home's import graph, and pulling
 * it in must not have reached `/send`. Read here rather than inside a test because the module registry
 * is shared across this file: once any test flushes a warm the module is cached and a later
 * "was it evaluated?" check can no longer distinguish an eager import from a warmed one.
 */
const evaluatedByImportingHome = mockSendRouteEvaluated;

function mountHome(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <LauncherHomeScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

let interactions: InteractionControl;
beforeEach(() => {
  interactions = controlInteractions();
  mockRequireSendRoute.mockClear();
});
afterEach(() => {
  interactions.restore();
});

/** Let the registry's macrotask yield elapse. REAL timers, deliberately: this test mounts the whole
 *  launcher on a live QueryClient, and freezing the clock under it deadlocks the mount. */
async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * "The launcher went idle" is now TWO steps, and that is exactly the change this pins. The registry
 * yields a macrotask before EACH route (src/boot/prewarm-routes.ts): with no `setDeadline` set,
 * `runAfterInteractions` drains its whole queue in one `setImmediate` batch, so without the yield
 * every warmed graph would land in one block — and the first would land while the launcher was still
 * committing its own frame. So: let the yield elapse, then drain the interaction queue.
 */
async function goIdle(): Promise<void> {
  await tick();
  act(() => interactions.flush());
}

describe("(tabs)/home.tsx — /send route prewarm (PERF-SEND-01)", () => {
  it("does not pull the send route into the launcher's import graph", () => {
    expect(evaluatedByImportingHome).toBe(false);
  });

  it("defers the warm rather than paying for it in Home's own render", async () => {
    const tree = mountHome();

    // Rendering the launcher must cost none of /send's 140 KB: the warm is scheduled, not executed.
    // Only ONE interaction is pending on a fresh mount — the boot_home_paint RUM mark
    // (useBootHomePaintMark, see home-boot-paint-mark.test.tsx). The prewarm is one step further
    // back, behind its own yield, so it has not even reached the interaction queue yet.
    expect(mockRequireSendRoute).not.toHaveBeenCalled();
    expect(interactions.pending()).toBe(1);

    // ...and it is still not executed once the yield elapses; it is merely queued by then.
    await tick();
    expect(mockRequireSendRoute).not.toHaveBeenCalled();
    expect(interactions.pending()).toBe(2);

    act(() => tree.unmount());
  });

  it("warms the route once the launcher is idle", async () => {
    const tree = mountHome();
    await goIdle();

    expect(mockSendRouteEvaluated).toBe(true);

    act(() => tree.unmount());
  });

  it("evaluates the route graph once per process, not once per Home mount", async () => {
    const first = mountHome();
    await goIdle();
    const afterFirst = mockRequireSendRoute.mock.calls.length;
    act(() => first.unmount());

    // Re-entering the launcher (Orders → Home, a tab switch) re-schedules the warm, but the module
    // registry already holds the graph — so the 140 KB is evaluated once for the life of the process,
    // however many times the customer bounces through Home.
    const second = mountHome();
    await goIdle();
    expect(mockRequireSendRoute.mock.calls.length).toBe(afterFirst);

    act(() => second.unmount());
  });

  it("withdraws the pending warm when the launcher is left first", async () => {
    const tree = mountHome();
    act(() => tree.unmount());

    expect(interactions.pending()).toBe(0);
    await goIdle();
    expect(mockRequireSendRoute).not.toHaveBeenCalled();
  });
});
