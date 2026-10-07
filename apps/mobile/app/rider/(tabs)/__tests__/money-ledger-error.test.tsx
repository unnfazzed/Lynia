/**
 * LC-D-SIB-1: a FAILED wallet-ledger read with nothing cached must not render M9's genuine empty row
 * ("No jobs yet today") — that tells a rider whose read failed that nothing ever happened. Rider screens
 * never show a Retry button (empty-states v2 §3, D-78): the row says what the app is doing ("Trying again
 * in {s} s") and re-reads the ledger by itself.
 */
// No `React` import: `jsx: react-jsx` needs none (see money-foreground-gate.test.tsx).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

let mockLedgerError = true;
let mockLedgerPaused = false;
let mockFocused = true;
const mockLedgerRefetch = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  // Runs the focus callback once on mount when the tab is "focused" (the tab navigator keeps Money mounted
  // out of view, so an unfocused mount must never re-read in the background).
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = jest.requireActual("react") as typeof import("react");
    R.useEffect(() => (mockFocused ? cb() : undefined), []);
  },
}));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
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
jest.mock("../../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: [] }) }));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ wallet: { balance: 4.6 }, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: { floor: 2 }, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, isError: mockLedgerError, isPaused: mockLedgerPaused, refetch: mockLedgerRefetch, hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmptyState } from "../../../../src/ui";
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

function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(""))
    .join(" | ");
}

let activeTree: renderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  mockLedgerError = true;
  mockLedgerPaused = false;
  mockFocused = true;
  mockLedgerRefetch.mockClear();
});
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.useRealTimers();
});

describe("Money tab · a failed ledger read is not an empty history (LC-D-SIB-1)", () => {
  it("errored with nothing cached: the L·error rider state, not 'No jobs yet today', and it re-reads by itself", () => {
    activeTree = renderScreen();
    const text = textOf(activeTree);
    expect(text).toContain("Something went wrong");
    expect(text).toContain("Trying again in 10 s");
    expect(text).not.toContain("No jobs yet today");
    const state = activeTree.root.findByType(EmptyState);
    expect(state.props).toMatchObject({ icon: "circle-alert", tone: "error" });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mockLedgerRefetch).toHaveBeenCalledTimes(1);
  });

  it("never re-reads while the tab is out of view (the navigator keeps Money mounted)", () => {
    mockFocused = false;
    activeTree = renderScreen();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockLedgerRefetch).not.toHaveBeenCalled();
  });

  it("an offline (paused) first read with nothing cached is the wifi-off variant, not 'No jobs yet today'", () => {
    mockLedgerError = false;
    mockLedgerPaused = true;
    activeTree = renderScreen();
    const text = textOf(activeTree);
    expect(text).toContain("Trying again in 10 s");
    expect(text).not.toContain("No jobs yet today");
    expect(activeTree.root.findByType(EmptyState).props).toMatchObject({ icon: "wifi-off", tone: "info" });
  });

  it("a genuinely empty ledger still shows M9's 'No jobs yet today'", () => {
    mockLedgerError = false;
    activeTree = renderScreen();
    const text = textOf(activeTree);
    expect(text).toContain("No jobs yet today");
    expect(text).not.toContain("Trying again");
  });
});
