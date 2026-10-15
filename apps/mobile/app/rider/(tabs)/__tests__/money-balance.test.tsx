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
let mockKyc: "verified" | "pending" = "verified";
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
  getMe: async () => ({ rider: { kycStatus: mockKyc, freeJobs: mockFreeLeft == null ? undefined : { left: mockFreeLeft, total: 5 } } }),
}));
jest.mock("../../../../src/api/wallet", () => ({ getTopup: (...a: unknown[]) => mockGetTopup(...a) }));
jest.mock("../../../../src/auth/session", () => ({
  loadPendingTopup: async () => mockMarker,
  clearPendingTopup: async () => {
    mockMarker = null;
  },
}));
let mockRows: unknown[] = [];
jest.mock("../../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: mockRows, showingStale: false, isFetching: false, refetch: jest.fn() }) }));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ ...mockWallet, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: mockConfig, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, refetch: jest.fn(), hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { COMMISSION } from "@lynia/shared";
import { RIDER_COPY as R, RF } from "../../../../src/ui/rider/copy";
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
  mockRows = [];
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

describe("Money · no floor: the per-job commission rule (PR #1154, D-104)", () => {
  // The floor model's lines, at any amount: "Below $0.00 you can't take jobs." / "Below the $0.00 floor."
  const FLOOR_CLAIM = /floor|Below \$/i;
  beforeEach(() => {
    mockConfig = { floor: COMMISSION.lowBalanceBlockBelow, ratePct: 10, minTopUp: 5 };
    mockFreeLeft = 0;
    // A job closed today, so the line under the balance shows (M9 hides it on an empty day).
    mockRows = [{ id: "o1", role: "rider", status: "delivered", orderType: "parcel", agreedFare: "3.00", pickup: { landmark: "Avondale" }, dropoff: { landmark: "Borrowdale" }, createdAt: new Date(Date.now() - 60_000).toISOString() }];
  });

  it("policy has no floor", () => {
    expect(COMMISSION.lowBalanceBlockBelow).toBe(0);
  });

  it.each([0, 0.2, 0.99, 5, 40])("a $%s balance never claims a floor", async (balance) => {
    mockWallet = { wallet: { balance }, isError: false };
    const t = await renderScreen();
    expect(texts(t).filter((x) => FLOOR_CLAIM.test(x))).toEqual([]);
  });

  it("a biker holding $5.00 is told the per-job rule", async () => {
    mockWallet = { wallet: { balance: 5 }, isError: false };
    const t = await renderScreen();
    expect(texts(t)).toContain("10% comes off when a job closes. You can take a job when your balance covers its commission.");
  });

  it.each([0, 0.2])("a biker holding $%s gets the drawn low line, not the floor alarm", async (balance) => {
    mockWallet = { wallet: { balance }, isError: false };
    const t = await renderScreen();
    expect(texts(t)).toContain(R.lowB);
    expect(texts(t)).not.toContain(RF.floorB(0));
  });

  it("a negative balance still owes", async () => {
    mockWallet = { wallet: { balance: -0.4 }, isError: false };
    const t = await renderScreen();
    expect(texts(t)).toContain(R.owesB);
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

describe("Money · Top up is for verified bikers", () => {
  afterEach(() => {
    mockKyc = "verified";
  });
  it("a verified biker gets Top up", async () => {
    const t = await renderScreen();
    expect(texts(t)).toContain("Top up");
  });
  it("an unverified biker gets no Top up (the server would refuse: kyc)", async () => {
    mockKyc = "pending";
    const t = await renderScreen();
    expect(texts(t)).not.toContain("Top up");
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
    // JQ-R3-02: a timed-out intent can still be credited late — never "Nothing was taken".
    expect(all).toContain(RF.pendingLate(5));
    expect(all).not.toContain(RF.pendingFail(5));
    expect(all).not.toContain(RF.pendingWait("EcoCash", 5));
    expect(mockMarker).toBeNull();
  });
});
