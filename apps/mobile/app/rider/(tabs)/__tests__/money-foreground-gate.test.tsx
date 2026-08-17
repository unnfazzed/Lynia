/**
 * The Money tab's app-foreground re-read must be gated on the tab actually being FOCUSED.
 *
 * Context: D-30 removed this screen's pull-to-refresh and replaced it with automatic recovery — a
 * focus re-read, an app-foreground re-read, and a 20s poll while focused AND erroring. The rider tab
 * navigator does not set `unmountOnBlur`, so once a rider opens Money the screen stays MOUNTED behind
 * the Jobs tab. An ungated `useForegroundRefetch` therefore spends two wallet round trips on every
 * app activation for a rider who cannot even see this screen — the metered-link waste the `isError`
 * gate exists to avoid. Caught in review on #798 and fixed here.
 *
 * This pins the gate at its seam: the `enabled` argument the screen hands `useForegroundRefetch`.
 * Both regressions that would reintroduce the waste fail here — dropping the argument entirely (the
 * hook defaults `enabled` to true) and re-initialising `focused` to `true` (which a
 * preloaded-but-never-focused mount could never correct, since `useFocusEffect`'s cleanup only runs
 * after a focus).
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

/** Whether the mocked `useFocusEffect` fires — i.e. whether this screen is the visible tab. */
let mockScreenIsFocused = true;
/** Every `enabled` value the screen has handed the hook, newest last. */
const mockEnabledArgs: (boolean | undefined)[] = [];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => {
      if (!mockScreenIsFocused) return;
      return cb();
    }, [cb]);
  },
}));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({
  useForegroundRefetch: (_cb: () => void, enabled?: boolean) => {
    mockEnabledArgs.push(enabled);
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/orders", () => ({ getActiveOrder: async () => null }));
jest.mock("../../../../src/api/food-rider", () => ({ getFoodOrderAsRider: async () => null }));
jest.mock("../../../../src/api/wallet", () => ({ getTopup: async () => null }));
jest.mock("../../../../src/auth/session", () => ({
  loadPendingTopup: async () => null,
  clearPendingTopup: async () => undefined,
}));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ wallet: { balance: 4.6 }, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: { floor: 2 }, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, refetch: jest.fn(), hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RiderMoneyTabScreen from "../money";

function renderScreen(): renderer.ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderMoneyTabScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

let activeTree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  mockEnabledArgs.length = 0;
  mockScreenIsFocused = true;
});
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
});

describe("Money tab · the app-foreground re-read is gated on focus (D-30 follow-up)", () => {
  it("mounted but never focused (blurred behind another tab): the foreground re-read is DISABLED", () => {
    mockScreenIsFocused = false;
    activeTree = renderScreen();

    // Strict false, not just falsy: `undefined` means the argument was dropped, and the hook's own
    // default would then re-enable the re-read for a screen the rider cannot see.
    expect(mockEnabledArgs.length).toBeGreaterThan(0);
    expect(mockEnabledArgs.at(-1)).toBe(false);
  });

  it("focused (the rider is looking at Money): the foreground re-read is ENABLED", () => {
    mockScreenIsFocused = true;
    activeTree = renderScreen();

    expect(mockEnabledArgs.at(-1)).toBe(true);
  });
});
