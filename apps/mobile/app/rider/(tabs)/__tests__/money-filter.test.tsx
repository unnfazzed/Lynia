/**
 * Money tab · the history's service chips.
 *
 * A filter that matches nothing (Food, with only parcel fares) must keep the chips on screen: they are
 * the only way back to All or Parcels. The chips used to be gated on the filtered feed, so picking an
 * empty filter hid them and stranded the rider on the empty row.
 */
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "react-native";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

const mockRows = [
  {
    id: "o1",
    role: "rider",
    status: "delivered",
    orderType: "parcel",
    agreedFare: 3.2,
    createdAt: new Date().toISOString(),
    pickup: { landmark: "Avondale" },
    dropoff: { landmark: "Borrowdale" },
  },
];

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React_ = require("react");
    React_.useEffect(() => cb(), [cb]);
  },
}));
jest.mock("../../../../src/realtime/use-foreground-refetch", () => ({ useForegroundRefetch: () => undefined }));
jest.mock("../../../../src/net/use-feature-flags", () => ({ useFeatureFlags: () => ({ merchantDispatchAutoEnabled: true }) }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../../../src/api/orders", () => ({ getActiveOrder: async () => null, getHistory: async () => [] }));
jest.mock("../../../../src/api/food-rider", () => ({ getFoodOrderAsRider: async () => null }));
jest.mock("../../../../src/api/auth", () => ({ getMe: async () => ({ rider: {} }) }));
jest.mock("../../../../src/api/wallet", () => ({ getTopup: jest.fn() }));
jest.mock("../../../../src/auth/session", () => ({ loadPendingTopup: async () => null, clearPendingTopup: async () => undefined }));
jest.mock("../../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: mockRows, showingStale: false, isFetching: false, refetch: jest.fn() }) }));
jest.mock("../../../../src/query/use-wallet", () => ({
  walletKey: ["wallet"],
  walletLedgerKey: ["walletLedger"],
  useWallet: () => ({ wallet: { balance: 5 }, isError: false, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useWalletConfig: () => ({ config: { floor: 2, ratePct: 0, minTopUp: 5 }, isLoading: false }),
  useWalletLedger: () => ({ entries: [], isLoading: false, refetch: jest.fn(), hasMore: false, isLoadingMore: false, loadMore: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptyCopy } from "../../../../src/ui";
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
  });
  return tree!;
}

function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((c) => typeof c === "string" || typeof c === "number").join(""));
}

function chip(t: renderer.ReactTestRenderer, label: string) {
  return t.root.find((n) => n.props.accessibilityRole === "button" && n.props.accessibilityLabel === label && typeof n.props.onPress === "function");
}

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

it("keeps the chips when a filter matches nothing, so the rider can go back to All", async () => {
  const t = await renderScreen();
  const fareTitle = `${R.lParcel} · Avondale → Borrowdale`;
  expect(texts(t)).toContain(fareTitle);

  await act(async () => chip(t, R.foodF).props.onPress());
  expect(texts(t)).not.toContain(fareTitle);
  expect(texts(t)).toContain(emptyCopy.rider.noJobsToday);
  // The way back is still on screen.
  expect(chip(t, R.all)).toBeTruthy();
  expect(chip(t, R.parcels)).toBeTruthy();

  await act(async () => chip(t, R.all).props.onPress());
  expect(texts(t)).toContain(fareTitle);
});
