/**
 * Tab bar v1 (`packages/design/handoff/tab-bar-v1/`, ledger D-56) — behaviour pins:
 * - a press on another tab navigates + plays the light tick; a re-tap of the active tab reselects
 *   (scroll to top) with NO haptic and no navigation;
 * - the bar is removed while `hidden` (keyboard open);
 * - each cell is a `tab` carrying the handoff's exact screen-reader string, badge included;
 * - the rider badge sources: new jobs since Jobs was last open (clears on Jobs), top-up below the
 *   floor, verification not done; the customer's live orders.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockHaptic = jest.fn();
jest.mock("../../haptics", () => ({ haptic: (k: string) => mockHaptic(k) }));

import { APP_TABS, RIDER_TABS, TabBar, type TabBadge } from "../TabBar";
import { useCustomerTabBadges, useRiderTabBadges } from "../TabShell";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 24 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

function mount(el: React.ReactElement): renderer.ReactTestRenderer {
  let r!: renderer.ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

/** One node per tab — the outermost element carrying the tab role (the Tappable), deduped by label. */
function tabsOf(r: renderer.ReactTestRenderer): renderer.ReactTestInstance[] {
  const seen = new Set<string>();
  return r.root.findAll((n) => n.props.accessibilityRole === "tab" && typeof n.props.onPress === "function").filter((n) => {
    if (seen.has(n.props.accessibilityLabel)) return false;
    seen.add(n.props.accessibilityLabel);
    return true;
  });
}

/** React Query batches observer notifications on a 0ms timer — flush it inside act. */
async function settle(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
    await new Promise((res) => setTimeout(res, 0));
  });
}

beforeEach(() => mockHaptic.mockClear());

describe("TabBar", () => {
  it("navigates with a light tick on a change, and reselects silently on the active tab", () => {
    const onTab = jest.fn();
    const onReselect = jest.fn();
    const r = mount(<TabBar tabs={APP_TABS} active="home" onTab={onTab} onReselect={onReselect} reduceMotion />);
    const [home, orders] = tabsOf(r);
    act(() => orders!.props.onPress());
    expect(onTab).toHaveBeenCalledWith("orders");
    expect(mockHaptic).toHaveBeenCalledWith("tap");
    mockHaptic.mockClear();
    act(() => home!.props.onPress());
    expect(onReselect).toHaveBeenCalledWith("home");
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(mockHaptic).not.toHaveBeenCalled();
  });

  it("is removed while hidden (soft keyboard open)", () => {
    const r = mount(<TabBar tabs={APP_TABS} active="home" hidden reduceMotion />);
    expect(r.root.findAll((n) => n.props.accessibilityRole === "tablist")).toHaveLength(0);
  });

  it("labels every cell with the handoff's string, selected state and badge", () => {
    const badges: Record<string, TabBadge> = { index: { kind: "count", n: 3 }, money: { kind: "warn" }, account: { kind: "dot" } };
    const r = mount(<TabBar tabs={RIDER_TABS} active="money" badges={badges} reduceMotion />);
    const cells = tabsOf(r);
    expect(cells.map((c) => c.props.accessibilityLabel)).toEqual([
      "Jobs, tab, 1 of 3, 3 new jobs",
      "Money, tab, 2 of 3, top-up needed",
      "Account, tab, 3 of 3, action needed",
    ]);
    expect(cells.map((c) => c.props.accessibilityState.selected)).toEqual([false, true, false]);
  });
});

// ── Badge sources ───────────────────────────────────────────────────────────────────────────────

function withClient(qc: QueryClient, Probe: () => null): renderer.ReactTestRenderer {
  let r!: renderer.ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return r;
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe("useCustomerTabBadges", () => {
  it("shows Orders live with the active-order count, nothing when there are none", async () => {
    const qc = newClient();
    const out: { current: ReturnType<typeof useCustomerTabBadges> | undefined } = { current: undefined };
    withClient(qc, () => {
      out.current = useCustomerTabBadges();
      return null;
    });
    expect(out.current).toEqual({});
    await settle(() => {
      qc.setQueryData(["activeCustomerOrders"], [{ id: "a" }, { id: "b" }]);
    });
    expect(out.current).toEqual({ orders: { kind: "live", n: 2 } });
  });
});

describe("useRiderTabBadges", () => {
  function setup(active: string) {
    const qc = newClient();
    const out: { current: ReturnType<typeof useRiderTabBadges> | undefined } = { current: undefined };
    let tab = active;
    const Probe = (): null => {
      out.current = useRiderTabBadges(tab);
      return null;
    };
    const r = withClient(qc, Probe);
    const go = (next: string) => {
      tab = next;
      act(() => r.update(<QueryClientProvider client={qc}><Probe /></QueryClientProvider>));
    };
    return { qc, out, go };
  }

  it("counts jobs that land while the rider is on another tab, and clears on opening Jobs", async () => {
    const { qc, out, go } = setup("index");
    await settle(() => {
      qc.setQueryData(["openOrders"], [{ id: "j1" }]);
    });
    expect(out.current?.index).toBeUndefined();
    go("money");
    await settle(() => {
      qc.setQueryData(["openOrders"], [{ id: "j1" }, { id: "j2" }, { id: "j3" }]);
    });
    expect(out.current?.index).toEqual({ kind: "count", n: 2 });
    go("index");
    expect(out.current?.index).toBeUndefined();
  });

  it("warns on Money below the floor and dots Account until verified", async () => {
    const { qc, out } = setup("index");
    await settle(() => {
      qc.setQueryData(["wallet", "config"], { floor: 2 });
      qc.setQueryData(["wallet", "balance"], { balance: 1.5 });
      qc.setQueryData(["me"], { rider: { kycStatus: "pending" } });
    });
    expect(out.current).toEqual({ money: { kind: "warn" }, account: { kind: "dot" } });
    await settle(() => {
      qc.setQueryData(["wallet", "balance"], { balance: 5 });
      qc.setQueryData(["me"], { rider: { kycStatus: "verified" } });
    });
    expect(out.current).toEqual({});
  });
});
