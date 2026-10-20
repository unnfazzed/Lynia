/**
 * Own bikers v1 · OB-R10 Money for one of a business's own bikers (ledger D-117). Pins:
 *   (1) the Money tab swaps to the gold "Cash with you · owed to {shop}" hero and HISTORY — no earnings, no
 *       commission card, no top-up;
 *   (2) each line reads "Collected · #B204 +$14.00" / "Returned to {shop} −$9.50";
 *   (3) a failed read keeps the hero at "—" and says it is retrying (rider screens have no Retry button).
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "react-native";
import type { FleetMoneyResponse } from "@lynia/shared";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const SHOP = "Chicken Inn Avondale";

const mockGetFleetMoney = jest.fn<Promise<FleetMoneyResponse>, []>();

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
jest.mock("../../../../src/api/auth", () => ({ getMe: async () => ({ rider: { kycStatus: "verified" } }) }));
jest.mock("../../../../src/api/wallet", () => ({ getTopup: jest.fn() }));
jest.mock("../../../../src/api/fleet", () => ({ getFleetMoney: () => mockGetFleetMoney() }));
jest.mock("../../../../src/auth/session", () => ({ loadPendingTopup: async () => null, clearPendingTopup: async () => undefined }));
jest.mock("../../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: [], showingStale: false, isFetching: false, refetch: jest.fn() }) }));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ wallet: { balance: 0 }, isError: false, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: { floor: 2, ratePct: 10, minTopUp: 5 }, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, refetch: jest.fn(), hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));
jest.mock("../../../../src/query/use-my-fleet", () => ({
  useFleetMoney: jest.requireActual("../../../../src/query/use-my-fleet").useFleetMoney,
  useMyFleet: () => ({ fleet: { shop: SHOP, paused: false, joinedAt: "2026-10-01T10:00:00Z" }, invites: [], loaded: true, answered: true }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RIDER_COPY as R } from "../../../../src/ui/rider/copy";
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
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}

beforeEach(() => mockGetFleetMoney.mockReset());
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe("OB-R10 · Money for an own biker", () => {
  it("shows the cash held for the shop and its history, and nothing of earnings or commission", async () => {
    const now = new Date().toISOString();
    mockGetFleetMoney.mockResolvedValue({
      shop: SHOP,
      cashHeld: "14.00",
      lines: [
        { kind: "collected", ref: "#B204", amount: "14.00", at: now },
        { kind: "returned", ref: "#B199", amount: "9.50", at: now },
      ],
    });
    const t = await renderScreen();
    const all = texts(t);
    expect(all).toContain(`Cash with you · owed to ${SHOP}`);
    expect(all).toContain("$14.00");
    expect(all).toContain("Hand it to the counter after each job.");
    expect(all).toContain("Collected · #B204");
    expect(all).toContain("+$14.00");
    expect(all).toContain(`Returned to ${SHOP}`);
    expect(all).toContain("−$9.50");
    expect(all.join(" ")).not.toMatch(/commission|Top up|earned/i);
    expect(all).not.toContain(R.yesterday);
  });

  it("an unreadable read keeps the hero at — and says it is retrying", async () => {
    mockGetFleetMoney.mockRejectedValue(new Error("offline"));
    const t = await renderScreen();
    const all = texts(t);
    expect(all).toContain("—");
    expect(all.join(" ")).toMatch(/retrying|Trying again/i);
  });
});
