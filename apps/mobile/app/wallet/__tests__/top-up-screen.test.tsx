/**
 * Rider top-up SCREEN wiring (the flow's own states are in `src/ui/rider/__tests__/top-up-flow.test.tsx`).
 * Rider v2 T1–T6 (ledger D-54): Back walks the steps inside the flow and leaves on the first one, so the
 * screen's job is the guarded exit — `/wallet/top-up` is pushed from Money with no tab bar, and a bare
 * `router.back()` no-ops on a history-less entry (a rider opening it from a top-up push), which is what
 * the `/rider/money` fallback is for — plus the defaults it feeds the flow from Settings and `me`.
 */
import renderer, { act } from "react-test-renderer";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockProps: Record<string, unknown> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: () => mockBack(), replace: (...a: [string]) => mockReplace(...a), canGoBack: () => mockCanGoBack }),
}));
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual<Record<string, unknown>>("@tanstack/react-query"),
  useQuery: () => ({ data: { phone: "+263772451180" } }),
}));
jest.mock("../../../src/query/use-wallet", () => ({
  useWalletConfig: () => ({ config: { minTopUp: 2, maxTopUp: 100, ratePct: 10 } }),
  useWallet: () => ({ wallet: { balance: 7.6 } }),
}));
jest.mock("../../../src/query/use-history-feed", () => ({ useHistoryFeed: () => ({ rows: [] }) }));
jest.mock("../../../src/logic/rider-prefs", () => ({
  useRiderPrefs: () => ({ prefs: { navApp: "gmaps", topupProvider: "innbucks", topupPhone: null }, save: jest.fn() }),
}));
jest.mock("../../../src/ui/rider/TopUpFlow", () => {
  const React_ = jest.requireActual<typeof import("react")>("react");
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TopUpFlow: (props: Record<string, unknown>) => {
      mockProps = props;
      return React_.createElement(Pressable, { testID: "topup-flow-exit", onPress: props.onExit as () => void });
    },
  };
});

import TopUpScreen from "../top-up";

let tree: renderer.ReactTestRenderer | null = null;
function render(): renderer.ReactTestRenderer {
  act(() => {
    tree = renderer.create(<TopUpScreen />);
  });
  return tree!;
}
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  mockCanGoBack = true;
  jest.clearAllMocks();
});

describe("rider top-up screen", () => {
  it("pops the stack on exit", () => {
    const t = render();
    act(() => t.root.findByProps({ testID: "topup-flow-exit" }).props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("falls back to the Money tab when there is no stack to pop", () => {
    mockCanGoBack = false;
    const t = render();
    act(() => t.root.findByProps({ testID: "topup-flow-exit" }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/rider/money");
  });

  it("prefills the provider from Settings and the number from the account", () => {
    render();
    expect(mockProps.defaultProvider).toBe("innbucks");
    expect(mockProps.defaultPhone).toBe("0772451180");
    expect(mockProps.ratePct).toBe(10);
  });
});
