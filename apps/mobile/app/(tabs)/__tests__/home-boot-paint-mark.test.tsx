/**
 * `boot_home_paint` (RCA §1.2/§6, docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md): the third
 * cold-start RUM mark — the redirect→home segment `boot_home` never covered. Two properties are
 * pinned, both review decisions:
 *   1. PRESENTED-frame semantics: the mark is enqueued from `runAfterInteractions`, never from the
 *      mount/layout pass itself — a layout-effect-timed sample would understate the customer-visible
 *      white gap (the frame isn't on glass yet when effects run).
 *   2. Leaving home before the frame settles withdraws the mark — an aborted mount must not report
 *      itself as a completed paint.
 * Same harness as home-send-prewarm.test.tsx (the other runAfterInteractions consumer on this screen).
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { controlInteractions, type InteractionControl } from "../../../src/testing/interactions";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

jest.mock("../../send", () => ({ __esModule: true, default: (): null => null }));

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

const mockEnqueueBoot = jest.fn();
jest.mock("../../../src/telemetry/rum", () => ({
  enqueueBoot: (event: string) => mockEnqueueBoot(event),
}));

import LauncherHomeScreen from "../home";

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
  mockEnqueueBoot.mockClear();
});
afterEach(() => {
  interactions.restore();
});

describe("(tabs)/home.tsx — boot_home_paint mark", () => {
  it("does not enqueue during the mount pass (presented-frame semantics, not layout timing)", () => {
    const tree = mountHome();
    expect(mockEnqueueBoot).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("enqueues exactly boot_home_paint once the first frame settles", () => {
    const tree = mountHome();
    act(() => interactions.flush());
    expect(mockEnqueueBoot).toHaveBeenCalledWith("boot_home_paint");
    expect(mockEnqueueBoot).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("withdraws the mark when home is left before the frame settles", () => {
    const tree = mountHome();
    act(() => tree.unmount());
    act(() => interactions.flush());
    expect(mockEnqueueBoot).not.toHaveBeenCalled();
  });
});
