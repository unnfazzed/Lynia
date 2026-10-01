import { useQuery } from "@tanstack/react-query";
import type { CommissionConfig, Wallet } from "@lynia/shared";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Me } from "../../api/auth";
import type { OpenOrder, OrderSnapshot } from "../../api/orders";
import { walletConfigKey, walletKey } from "../../query/use-wallet";
import { useReduceMotion } from "../useReduceMotion";
import { TAB_BAR_SPACE, TabBar, type AppTab, type TabBadge } from "./TabBar";

/*
 * The tab shells' plumbing for tab bar v1 (`packages/design/handoff/tab-bar-v1/`, ledger D-56): the
 * floating bar is absolutely positioned over the screens, so the layout contract ("content pads by
 * 72 + inset + 16") travels to the tab roots through a context instead of the bar taking layout space.
 */

type Scrollable = { scrollTo?: (o: { y: number; animated?: boolean }) => void; scrollToOffset?: (o: { offset: number; animated?: boolean }) => void };
type ScrollTop = () => void;

type Shell = {
  /** The bar's reserve from the screen's bottom edge; 0 outside a tab shell. */
  space: number;
  /** Tab roots register their scroll-to-top by tab id; a re-tap on the active tab calls it. */
  register: (id: string, fn: ScrollTop) => () => void;
  reselect: (id: string) => void;
};

const NO_SHELL: Shell = { space: 0, register: () => () => undefined, reselect: () => undefined };
const TabShellContext = createContext<Shell>(NO_SHELL);

/**
 * The bar's reserve from the screen's bottom edge — `TAB_BAR_SPACE` (72) + the bottom safe-area inset —
 * inside a tab shell, `0` anywhere else. Tab roots pad scroll content by this + 16; a pinned CTA panel
 * becomes the dock by padding its bottom by this + 12.
 */
export function useTabBarSpace(): number {
  return useContext(TabShellContext).space;
}

export function TabBarSpaceProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const handlers = useRef(new Map<string, ScrollTop>());
  const space = TAB_BAR_SPACE + insets.bottom;
  const value = useMemo<Shell>(
    () => ({
      space,
      register: (id, fn) => {
        handlers.current.set(id, fn);
        return () => {
          if (handlers.current.get(id) === fn) handlers.current.delete(id);
        };
      },
      reselect: (id) => handlers.current.get(id)?.(),
    }),
    [space],
  );
  return <TabShellContext.Provider value={value}>{children}</TabShellContext.Provider>;
}

/** Re-taps of the active tab, for the bar inside the shell. */
export function useTabReselect(): (id: string) => void {
  return useContext(TabShellContext).reselect;
}

/** Soft keyboard visibility — the bar is removed while it's open (handoff: "Hidden on"). */
export function useKeyboardVisible(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/**
 * Re-tapping the active tab scrolls that tab's root list to the top (handoff: Motion) — smooth, or
 * instant under reduce motion. Already at the top, the scroll is a no-op.
 */
export function useTabScrollToTop(id: string, ref: React.RefObject<Scrollable | null>, animated = true): void {
  const { register } = useContext(TabShellContext);
  useEffect(
    () =>
      register(id, () => {
        const el = ref.current;
        if (!el) return;
        if (el.scrollToOffset) el.scrollToOffset({ offset: 0, animated });
        else el.scrollTo?.({ y: 0, animated });
      }),
    [register, id, ref, animated],
  );
}

/**
 * A tab root's scroll wiring in one call: the ref for its root ScrollView (re-tap scrolls it to the top —
 * smooth, instant under reduce motion) and the content's bottom pad (bar reserve + 16; 16 outside a shell).
 */
export function useTabRoot<T extends Scrollable>(id: string): { scrollRef: React.RefObject<T | null>; bottomPad: number } {
  const scrollRef = useRef<T>(null);
  const reduceMotion = useReduceMotion();
  useTabScrollToTop(id, scrollRef, !reduceMotion);
  return { scrollRef, bottomPad: useTabBarSpace() + 16 };
}

/**
 * The bar as a `Tabs` `tabBar`: navigates on a change, scrolls the active root to the top on a re-tap,
 * and hides with the keyboard. `id` is the route segment name, so a press needs no lookup table.
 */
export function ShellTabBar({
  tabs,
  state,
  navigation,
  badges,
}: {
  tabs: AppTab[];
  state: { index: number; routeNames: string[] };
  navigation: { navigate: (name: string) => void };
  badges?: Partial<Record<string, TabBadge | null>>;
}): React.ReactElement | null {
  const keyboard = useKeyboardVisible();
  const reselect = useTabReselect();
  return <TabBar tabs={tabs} active={state.routeNames[state.index]} badges={badges} hidden={keyboard} onTab={(id) => navigation.navigate(id)} onReselect={reselect} />;
}

// ── Badge sources ───────────────────────────────────────────────────────────────────────────────
// Cache-only reads (`enabled: false`): the tab roots own the fetching and polling, and these observers
// re-render the bar whenever that cached data changes, without adding a single request of their own.

const noFetch = (): never => {
  throw new Error("tab badge observers never fetch");
};

/** Customer: Orders `live` while the customer has 1+ active orders. */
export function useCustomerTabBadges(): Partial<Record<string, TabBadge>> {
  const active = useQuery<OrderSnapshot[]>({ queryKey: ["activeCustomerOrders"], queryFn: noFetch, enabled: false }).data;
  const n = Array.isArray(active) ? active.length : 0;
  return n > 0 ? { orders: { kind: "live", n } } : {};
}

/**
 * Rider:
 * - Jobs `count` — jobs that landed on the board since the rider last had Jobs open; clears on opening it.
 * - Money `warn` — balance below the floor (top-up needed), the same rule the board's top-up gate uses.
 * - Account `dot` — verification (KYC) isn't done.
 */
export function useRiderTabBadges(active: string | undefined): Partial<Record<string, TabBadge>> {
  const open = useQuery<OpenOrder[]>({ queryKey: ["openOrders"], queryFn: noFetch, enabled: false }).data;
  const wallet = useQuery<Wallet>({ queryKey: walletKey, queryFn: noFetch, enabled: false }).data;
  const config = useQuery<CommissionConfig>({ queryKey: walletConfigKey, queryFn: noFetch, enabled: false }).data;
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: noFetch, enabled: false }).data;

  const ids = Array.isArray(open) ? open.map((o) => o.id) : [];
  const seen = useRef<Set<string> | null>(null);
  const onJobs = active === "index";
  if (onJobs || seen.current == null) seen.current = new Set(ids);
  const fresh = onJobs ? 0 : ids.filter((id) => !seen.current!.has(id)).length;

  const out: Partial<Record<string, TabBadge>> = {};
  if (fresh > 0) out.index = { kind: "count", n: fresh };
  if (wallet && Number(wallet.balance) < (config?.floor ?? 2)) out.money = { kind: "warn" };
  if (me?.rider && me.rider.kycStatus !== "verified") out.account = { kind: "dot" };
  return out;
}
