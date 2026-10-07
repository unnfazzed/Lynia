/**
 * Money tab · the commission balance card and the pending top-up notice.
 *
 * MA-H2: the floor alarm follows the server's online gate (rate above 0% AND free jobs used up), so a
 * pilot rider at $0 is not told they're blocked while the board keeps them online.
 * MA-M6: an unreadable wallet shows "—" and the retrying line, not "$0.00, below the floor".
 * MA-M2: the pending top-up notice re-checks while pending and turns final once the server says so.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "react-native";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

let mockWallet: { wallet: { balance: number } | undefined; isError: boolean } = { wallet: { balance: 0 }, isError: false };
let mockConfig: { floor: number; ratePct: number; minTopUp: number } = { floor: 2, ratePct: 0, minTopUp: 5 };
let mockFreeLeft: number | undefined;
let mockMarker: { topupId: string } | null = null;
const mockGetTopup = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => cb(), [cb]);
  },
}));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/orders", () => ({ getActiveOrder: async () => null, getHistory: async () => [] }));
jest.mock("../../../../src/api/food-rider", () => ({ getFoodOrderAsRider: async () => null }));
jest.mock("../../../../src/api/auth", () => ({
  getMe: async () => ({ rider: { freeJobs: mockFreeLeft == null ? undefined : { left: mockFreeLeft, total: 5 } } }),
}));
jest.mock("../../../../src/api/wallet", () => ({ getTopup: (...a: unknown[]) => mockGetTopup(...a) }));
jest.mock("../../../../src/auth/session", () => ({
  loadPendingTopup: async () => mockMarker,
  clearPendingTopup: async () => {
    mockMarker = null;
  },
}));
jest.mock("../../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: [], showingStale: false, isFetching: false, refetch: jest.fn() }) }));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ ...mockWallet, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: mockConfig, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, refetch: jest.fn(), hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RF } from "../../../../src/ui/rider/copy";
import RiderMoneyTabScreen from "../money";

let tree: renderer.ReactTestRenderer | null = null;

async function renderScreen(): Promise<renderer.ReactTestRenderer> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <RiderMoneyTabScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  // Let `me` and the pending-marker read settle.
  await act(async () => {
    await Promise.resolve();
  });
  return tree!;
}

function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}

beforeEach(() => {
  mockWallet = { wallet: { balance: 0 }, isError: false };
  mockConfig = { floor: 2, ratePct: 0, minTopUp: 5 };
  mockFreeLeft = undefined;
  mockMarker = null;
  mockGetTopup.mockReset();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.useRealTimers();
});

describe("Money · the floor follows the server's online gate (MA-H2)", () => {
  it("at 0% a $0 balance is not below the floor", async () => {
    const t = await renderScreen();
    expect(texts(t)).not.toContain(RF.floorB(2));
  });

  it("with free jobs left a $0 balance is not below the floor", async () => {
    mockConfig = { floor: 2, ratePct: 10, minTopUp: 5 };
    mockFreeLeft = 3;
    const t = await renderScreen();
    expect(texts(t)).not.toContain(RF.floorB(2));
  });

  it("commission on and free jobs used up: the floor alarm shows", async () => {
    mockConfig = { floor: 2, ratePct: 10, minTopUp: 5 };
    mockFreeLeft = 0;
    const t = await renderScreen();
    expect(texts(t)).toContain(RF.floorB(2));
  });
});

describe("Money · an unreadable wallet (MA-M6)", () => {
  it("shows — and the retrying line, never the floor alarm", async () => {
    mockConfig = { floor: 2, ratePct: 10, minTopUp: 5 };
    mockFreeLeft = 0;
    mockWallet = { wallet: undefined, isError: true };
    const t = await renderScreen();
    const all = texts(t);
    expect(all).toContain("—");
    expect(all).toContain("Trying again in 20 s");
    expect(all).not.toContain(RF.floorB(2));
  });
});

describe("Money · the pending top-up notice (MA-M2, MA-L2)", () => {
  it("names the amount, polls while pending, and turns final when the server expires it", async () => {
    jest.useFakeTimers();
    mockMarker = { topupId: "t1" };
    const base = { id: "t1", amount: 5, rail: "ecocash", phone: "0771234567", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    mockGetTopup.mockResolvedValueOnce({ ...base, status: "pending" }).mockResolvedValue({ ...base, status: "expired" });
    const t = await renderScreen();
    expect(texts(t)).toContain(RF.pendingWait("EcoCash", 5));
    expect(RF.pendingWait("EcoCash", 5)).toBe("Waiting for EcoCash to confirm your $5.00 top-up…");

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetTopup).toHaveBeenCalledTimes(2);
    const all = texts(t);
    expect(all).toContain(RF.pendingFail(5));
    expect(all).not.toContain(RF.pendingWait("EcoCash", 5));
    expect(mockMarker).toBeNull();
  });
});
