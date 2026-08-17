/**
 * Rider top-up SCREEN wiring (as opposed to `src/ui/rider/__tests__/top-up-flow.test.tsx`, which
 * covers the flow's own states). Two things live at this level and nowhere else: the back row the kit
 * draws above the heading (ledger D-17), and the guarded exit both that row and `TopUpFlow` share.
 *
 * The guard matters because `/wallet/top-up` is pushed from the Money tab, so nothing else on the
 * screen leads out: no tab bar, and `headerShown:false` on the stack. A bare `router.back()` no-ops on
 * a history-less entry — a rider opening this from a push notification about a top-up outcome — which
 * is exactly what the `/rider/money` fallback is for.
 */
import renderer, { act } from "react-test-renderer";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: () => mockBack(), replace: (...a: [string]) => mockReplace(...a), canGoBack: () => mockCanGoBack }),
}));
jest.mock("../../../src/query/use-wallet", () => ({
  useWalletConfig: () => ({ config: { minTopUp: 5, maxTopUp: 100 } }),
}));
// The flow itself is exercised by its own test; here it is a prop probe, so the screen's wiring is
// what's under test rather than the rail.
jest.mock("../../../src/ui/rider/TopUpFlow", () => {
  const React_ = jest.requireActual<typeof import("react")>("react");
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    // Surfaces the screen's own onExit as something pressable, so the test drives the real prop rather
    // than reaching into internals — this is the wiring under test.
    TopUpFlow: (props: { onExit: () => void }) => React_.createElement(Pressable, { testID: "topup-flow-exit", onPress: props.onExit }),
  };
});

import TopUpScreen from "../top-up";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<TopUpScreen />);
  });
  return tree;
}

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  mockCanGoBack = true;
  jest.clearAllMocks();
});

describe("rider top-up screen — the entry state has a way out (nav audit N-01, ledger D-17)", () => {
  it("draws the kit's back row, which pops the stack", () => {
    activeTree = render();
    const back = activeTree.root.findAll((n) => n.props.accessibilityLabel === "Back to Money" && typeof n.props.onPress === "function");
    expect(back.length).toBeGreaterThan(0);

    act(() => back[0]!.props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to the Money tab when there is no stack to pop", () => {
    mockCanGoBack = false;
    activeTree = render();
    const back = activeTree.root.findAll((n) => n.props.accessibilityLabel === "Back to Money" && typeof n.props.onPress === "function");

    act(() => back[0]!.props.onPress());
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/rider/money");
  });

  // TopUpFlow's own "Back to Money" buttons (pending / succeeded / declined / expired) must not be
  // wired to a bare router.back() that silently no-ops on a history-less entry.
  it("hands TopUpFlow the same guarded exit, not a bare back()", () => {
    mockCanGoBack = false;
    activeTree = render();
    const flow = activeTree.root.findByProps({ testID: "topup-flow-exit" });

    act(() => flow.props.onPress());
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/rider/money");
  });
});
