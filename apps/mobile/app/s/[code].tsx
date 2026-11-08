import { normalizeShopCode, type ShopShareCardResponse, type ShopShareService } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { getActiveOrder } from "../../src/api/orders";
import { getShopCard, resolveShopLink } from "../../src/api/share";
import { useAuth } from "../../src/auth/auth-context";
import { loadRolePreference } from "../../src/auth/device-state";
import { replaceClearingStack } from "../../src/logic/nav";
import { switchToCustomer } from "../../src/logic/switch-to-customer";
import { riderModeAvailable } from "../../src/rider-mode";
import { EVENTS, track } from "../../src/telemetry/events";
import { holdInstallTipForLink } from "../../src/share/link-tip-hold";
import { clearPendingShop, saveShopArrival, savePendingShop } from "../../src/share/pending-shop";
import { EmptyState } from "../../src/ui";
import { BrowseButton, IconButton, initial } from "../../src/ui/browse/kit";
import { Sheet } from "../../src/ui/browse/sheets";
import { StoreSkeleton } from "../../src/ui/browse/store";
import { Icon } from "../../src/ui/Icon";
import { RemoteImage } from "../../src/ui/RemoteImage";
import { fill, SH } from "../../src/ui/share/copy";

/** No answer in this long counts as "can't reach LyniaGo" (README §2, SH-A5). */
export const RESOLVE_TIMEOUT_MS = 10_000;

/** The store screen for each section. */
export const STORE_ROUTE: Record<ShopShareService, "/food/[id]" | "/shops/[id]" | "/pharmacy/[id]"> = {
  restaurants: "/food/[id]",
  shops: "/shops/[id]",
  pharmacy: "/pharmacy/[id]",
};

type State =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "net" }
  | { kind: "biker"; busy: boolean };

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Timeout()), ms)))]).finally(() => clearTimeout(timer));
}

/**
 * A shop share link opened in the app: `lynia://s/<CODE>` (the website's Android intent), `app.lyniago.com/s/<CODE>`
 * (the web app), or `/s/<CODE>` from Home's hand-over after sign-up (handoff shop-share-v1 README §2, ledger D-129).
 *
 *   signed out  the code is kept (src/share/pending-shop.ts) and the person goes to C2, skipping C1. Home brings
 *               them back here once the account exists.
 *   biker side  SH-A7 "Open as customer?" over a plain page (A7b on a live job: finish it first).
 *   customer    SH-A1 (the store skeleton, real Back) → the store for the link's section; SH-A4 for a code that
 *               doesn't open a shop (unknown, not live, paused: one 404); SH-A5 offline or no answer in 10 s,
 *               Try again keeps the code.
 */
export default function ShopLinkScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  // The last dash-separated part is the code (lynia://s/chicken-inn-avondale-7KQ2MX reaches here too).
  const code = normalizeShopCode(String(raw ?? "").split("-").pop());
  const [state, setState] = useState<State>({ kind: "loading" });
  const [activeJob, setActiveJob] = useState(false);
  const [card, setCard] = useState<ShopShareCardResponse | null>(null);
  const started = useRef(false);

  const back = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else replaceClearingStack(router, "/home");
  }, [router]);

  const open = useCallback(async (): Promise<void> => {
    if (!code) {
      setState({ kind: "gone" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await withTimeout(resolveShopLink(code), RESOLVE_TIMEOUT_MS);
      await clearPendingShop();
      // Order.shareCode (D-129): an order at this shop in the next day counts as coming from the link.
      await saveShopArrival(res.merchantId, code);
      track(EVENTS.shopLinkOpened, { service: res.service });
      const store = { pathname: STORE_ROUTE[res.service], params: { id: res.merchantId } } as const;
      // Back from a cold start goes to Home; from a warm start, to where the person was (README §2).
      if (router.canGoBack()) router.replace(store);
      else {
        router.replace("/home");
        router.push(store);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        await clearPendingShop();
        setState({ kind: "gone" });
      } else setState({ kind: "net" });
    }
  }, [code, router]);

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    // DR12: on the web app, the Add to Home Screen tip waits until this person's first order.
    if (code) holdInstallTipForLink();
    if (!session) {
      // Signed out: keep the shop and start sign-up on C2 (the link skips C1).
      void savePendingShop(code).then(() => replaceClearingStack(router, "/phone"));
      return;
    }
    void loadRolePreference().then(async (pref) => {
      const rider = (pref ?? (session.role === "rider" ? "rider" : "customer")) === "rider" && riderModeAvailable();
      if (!rider) return open();
      const job = await getActiveOrder().then(
        (o) => o != null && o.status !== "cancelled",
        () => false,
      );
      setActiveJob(job);
      setState({ kind: "biker", busy: false });
      if (code) getShopCard(code).then(setCard, () => undefined);
    });
  }, [loading, session, code, router, open]);

  if (state.kind === "loading") {
    return (
      <View testID="shop-link-loading" style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <StoreSkeleton />
        {/* SH-A1: Back is real; Search and Share appear once the store loads. */}
        <View style={{ position: "absolute", top: insets.top + 8, left: 10 }}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
        </View>
      </View>
    );
  }

  if (state.kind === "gone" || state.kind === "net") {
    const gone = state.kind === "gone";
    return (
      <View testID={gone ? "shop-link-gone" : "shop-link-net"} style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
        </View>
        <EmptyState
          icon={gone ? "store" : "wifi-off"}
          tone={gone ? "info" : "error"}
          title={gone ? SH.arrival.goneT : SH.arrival.netT}
          body={gone ? SH.arrival.goneS : SH.arrival.netS}
          primary={gone ? { label: SH.arrival.goneCta, onPress: () => replaceClearingStack(router, "/food") } : { label: SH.arrival.netCta, onPress: () => void open() }}
        />
      </View>
    );
  }

  // SH-A7 / A7b: a biker opened a shop link.
  const stay = (): void => {
    void clearPendingShop();
    replaceClearingStack(router, "/rider");
  };
  const asCustomer = (): void => {
    setState({ kind: "biker", busy: true });
    void switchToCustomer(activeJob).then(() => open());
  };
  return (
    <View testID="shop-link-biker" style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <Sheet visible onClose={stay}>
        <View style={{ gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name={activeJob ? "bike" : "store"} size={24} color={tokens.color.accentText} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25, letterSpacing: -0.3, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {activeJob ? SH.biker.busyT : SH.biker.t}
          </Text>
          {card && !activeJob ? (
            <View style={{ backgroundColor: tokens.color.surface, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
              {card.logoThumbUrl ? (
                <RemoteImage source={{ uri: card.logoThumbUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{initial(card.name)}</Text>
                </View>
              )}
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                {card.name}
              </Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.muted }}>
            {fill(activeJob ? SH.biker.busyS : SH.biker.s, { shop: card?.name ?? SH.chip.noName })}
          </Text>
          {activeJob ? (
            <BrowseButton label={SH.biker.busyOk} onPress={stay} />
          ) : (
            <>
              <BrowseButton label={SH.biker.yes} onPress={asCustomer} disabled={state.busy} />
              <BrowseButton label={SH.biker.no} variant="ghost" onPress={stay} />
            </>
          )}
        </View>
      </Sheet>
    </View>
  );
}
