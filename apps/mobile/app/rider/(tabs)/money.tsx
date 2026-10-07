import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, Text, View } from "react-native";
import { getMe } from "../../../src/api/auth";
import { getFoodOrderAsRider } from "../../../src/api/food-rider";
import { getActiveOrder } from "../../../src/api/orders";
import { getTopup } from "../../../src/api/wallet";
import { clearPendingTopup, loadPendingTopup } from "../../../src/auth/session";
import { buildMoneyFeed, filterMoneyFeed, type MoneyItem, oldestHistoryAt } from "../../../src/logic/money-feed";
import { groupByDay, type ServiceFilter, summarise } from "../../../src/logic/rider-earnings";
import { floorApplies, reconcilePendingTopup } from "../../../src/logic/topup";
import { useNow } from "../../../src/logic/use-now";
import { useFeatureFlags } from "../../../src/net/use-feature-flags";
import { useHistoryFeed } from "../../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../../src/realtime/use-foreground-refetch";
import { useWallet, useWalletConfig, useWalletLedger, walletKey, walletLedgerKey } from "../../../src/query/use-wallet";
import { AppScreen, EmptyRow, emptyCopy, fillEmpty, Icon, SkeletonRows, useTabRoot } from "../../../src/ui";
import { useAutoRetry } from "../../../src/ui/rider/RiderErrorState";
import { SmBtn } from "../../../src/ui/order/kit";
import { Notice } from "../../../src/ui/send/kit";
import { hhmm, RIDER_COPY as R, RF, usd } from "../../../src/ui/rider/copy";
import { CashLine, CashSplit, Chips, LRow, MintTop, RCard, RLabel, Seg } from "../../../src/ui/rider/kit";
import { useTabTop } from "../../../src/query/use-tab-top";
import type { IconName } from "../../../src/ui";

/**
 * Recovery for `session.ts`'s durable `PendingTopup` marker (UX-2026-07-16): an app kill during the
 * top-up wait lost all UI state. Resolve any marker against the server and clear it once the outcome is
 * known. MA-M2: the tab stays mounted, so this re-checks on every focus and app resume (a rider who backs
 * out of the approve step lands here with the marker set), polls while the intent is pending (the server
 * expires it on read once `expiresAt` passes), and drops the notice once the marker is gone.
 */
type PendingTopupNotice = { kind: "succeeded"; amount: number } | { kind: "pending"; provider: string; amount: number } | { kind: "terminal"; amount: number };
const PENDING_POLL_MS = 5_000;
function usePendingTopupReconciliation(focused: boolean): PendingTopupNotice | null {
  const qc = useQueryClient();
  const [notice, setNotice] = React.useState<PendingTopupNotice | null>(null);
  const [tick, setTick] = React.useState(0);
  const recheck = React.useCallback(() => setTick((n) => n + 1), []);
  useForegroundRefetch(recheck, focused);
  React.useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      const marker = await loadPendingTopup();
      if (cancelled) return;
      if (!marker) {
        // Settled elsewhere (the top-up screen clears it on a final status): a pending notice is stale.
        setNotice((n) => (n?.kind === "pending" ? null : n));
        return;
      }
      try {
        const topup = await getTopup(marker.topupId);
        if (cancelled) return;
        const outcome = reconcilePendingTopup(topup.status);
        if (outcome === "succeeded") {
          void qc.invalidateQueries({ queryKey: walletKey });
          void qc.invalidateQueries({ queryKey: walletLedgerKey });
          void clearPendingTopup();
          setNotice({ kind: "succeeded", amount: topup.amount });
        } else if (outcome === "terminal") {
          void clearPendingTopup();
          setNotice({ kind: "terminal", amount: topup.amount });
        } else {
          setNotice({ kind: "pending", amount: topup.amount, provider: topup.rail === "innbucks" ? "InnBucks" : topup.rail === "omari" ? "O'mari" : "EcoCash" });
          timer = setTimeout(recheck, PENDING_POLL_MS);
        }
      } catch {
        /* transient — the marker stays; the next poll, focus or resume tries again */
        timer = setTimeout(recheck, PENDING_POLL_MS);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [qc, focused, tick, recheck]);
  return notice;
}

function itemIcon(i: MoneyItem): IconName {
  if (i.kind === "fare") return i.service === "food" ? "utensils" : "package";
  if (i.kind === "commission") return "wallet";
  if (i.kind === "topup") return "plus";
  return "banknote";
}

function itemTitle(i: MoneyItem): string {
  if (i.kind === "fare") return `${i.service === "food" ? R.lFood : R.lParcel} · ${i.title}`;
  if (i.kind === "commission" && i.ratePct != null) return `${R.lComm} · ${i.ratePct}%`;
  return i.title;
}

function itemMeta(i: MoneyItem): string {
  const t = hhmm(i.at);
  if (i.kind === "fare") return RF.lMeta(R.lFare, t);
  return RF.lMeta(i.amount < 0 ? R.fromBalance : R.toBalance, t);
}

/** Bars for the week strip: today's bar is accent with a 700 label, the rest accent-wash. */
function WeekBars({ byDay, todayIdx }: { byDay: number[]; todayIdx: number }): React.ReactElement {
  const max = Math.max(1, ...byDay);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 56 }} accessible accessibilityLabel={byDay.map((v, i) => `${"MTWTFSS"[i]} ${usd(v)}`).join(", ")}>
      {byDay.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: 3 }}>
          <View style={{ width: "100%", height: Math.max(2, (v / max) * 40), borderRadius: 4, backgroundColor: i === todayIdx ? tokens.color.accent : tokens.color.accentWash }} />
          <Text style={{ fontSize: 11, color: i === todayIdx ? tokens.color.ink : tokens.color.muted, fontWeight: i === todayIdx ? tokens.font.weight.bold : tokens.font.weight.regular }}>{"MTWTFSS"[i]}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Money tab (Rider v2 M1–M12, ledger D-54): earnings first (Today | This week, 40/700 total, job
 * counts, the week strip), then the commission balance with Top up inline, then the cash the rider is
 * holding, then one history list — fares merged with commission and top-ups, grouped by day, filterable
 * by service (chips hidden with food dispatch off), loading older wallet entries as the rider scrolls.
 * No pull-to-refresh and no "Load older" button: focus and app-resume re-read on their own (D-30).
 */
export default function RiderMoneyTabScreen(): React.ReactElement {
  const router = useRouter();
  const { scrollRef, bottomPad } = useTabRoot<ScrollView>("money");
  const qc = useQueryClient();
  const top = useTabTop("rider");
  const now = useNow();
  const { merchantDispatchAutoEnabled: foodOn } = useFeatureFlags();
  const { config } = useWalletConfig();
  const { wallet, isLoading, isError } = useWallet();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const { entries, isLoading: ledgerLoading, hasMore, isLoadingMore, loadMore } = useWalletLedger();
  const { rows: history } = useHistoryFeed();
  const [range, setRange] = useState<"today" | "week">("today");
  const [filter, setFilter] = useState<ServiceFilter>("all");

  // "Owed to a kitchen" — one job at a time, so it's the single active food job's open debt.
  const activeJob = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder }).data ?? null;
  const foodDebtQ = useQuery({
    queryKey: ["foodOrderAsRider", activeJob?.id],
    queryFn: () => getFoodOrderAsRider(activeJob!.id),
    enabled: activeJob?.orderType === "merchant",
  });
  const owed = activeJob?.orderType === "merchant" && foodDebtQ.data?.debtStatus === "open" ? (foodDebtQ.data.debtAmount ?? 0) : 0;

  // Re-read on focus and on app resume (no manual refresh, D-30); a failed read retries every 20s
  // while the tab is focused. The tab navigator keeps this screen mounted, so both are focus-gated.
  const [focused, setFocused] = useState(false);
  const reread = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: walletKey });
    void qc.invalidateQueries({ queryKey: walletLedgerKey });
  }, [qc]);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      reread();
      return () => setFocused(false);
    }, [reread]),
  );
  useForegroundRefetch(reread, focused);
  const pending = usePendingTopupReconciliation(focused);
  // MA-M6: an unreadable wallet is unknown, not $0 — "—" and the retrying line (BalanceRetry, which
  // also re-reads), never the floor alarm. A failed re-read over a known balance retries quietly.
  const unreadable = isError && wallet == null;
  React.useEffect(() => {
    if (!focused || !isError || unreadable) return;
    const t = setInterval(reread, 20_000);
    return () => clearInterval(t);
  }, [focused, isError, unreadable, reread]);

  const rows = useMemo(() => history ?? [], [history]);
  const earned = summarise(rows, range, now);
  const today = range === "today" ? earned : summarise(rows, "today", now);
  const feed = useMemo(() => {
    const all = buildMoneyFeed(rows, entries);
    // Fares older than the history we hold would misplace among older wallet pages; cut them there.
    const cut = rows.length >= 50 ? oldestHistoryAt(rows) : null;
    return filterMoneyFeed(cut ? all.filter((i) => i.kind !== "fare" || i.at >= cut) : all, foodOn ? filter : "all");
  }, [rows, entries, filter, foodOn]);
  const groups = groupByDay(feed, (i) => i.at, now, R.todayH, R.yesterday);

  const floor = config?.floor ?? 2;
  const rate = config?.ratePct ?? 0;
  const balance = wallet?.balance ?? 0;
  // MA-H2: the server's online gate — the floor only binds once commission is on AND the rider's free
  // first jobs are used up (online-gate.ts). Below it otherwise, the rider still rides: no alarm.
  const gated = floorApplies(rate, me?.rider?.freeJobs?.left);
  const owes = !unreadable && balance < 0;
  const belowFloor = gated && !unreadable && !owes && balance < floor;
  const low = gated && !unreadable && !owes && !belowFloor && balance < floor + 1;
  const danger = owes || belowFloor;
  const balanceText = owes ? R.owesB : belowFloor ? RF.floorB(floor) : low ? R.lowB : rate > 0 ? RF.balanceB(rate, floor) : R.balanceB0;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (hasMore && !isLoadingMore && layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) loadMore();
  };

  const noJobs = earned.jobs === 0;

  return (
    <AppScreen banner={<MintTop {...top} />}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={200}>
        {pending ? (
          pending.kind === "succeeded" ? (
            <Notice tone="wash" icon="circle-check" text={RF.pendingOk(pending.amount)} />
          ) : pending.kind === "pending" ? (
            <Notice icon="hourglass" text={RF.pendingWait(pending.provider, pending.amount)} />
          ) : (
            <Notice icon="circle-alert" text={RF.pendingFail(pending.amount)} />
          )
        ) : null}

        <RCard style={{ padding: 14, gap: 10 }}>
          <RLabel>{R.earnings}</RLabel>
          <Seg
            opts={[
              { id: "today", label: R.today },
              { id: "week", label: R.week },
            ]}
            value={range}
            onChange={setRange}
            accessibilityLabel={R.earnings}
          />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 40, lineHeight: 46, fontWeight: tokens.font.weight.bold, letterSpacing: -0.8, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{usd(earned.total)}</Text>
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{RF.jobs(earned.jobs)}</Text>
          </View>
          {noJobs || !foodOn ? null : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  [RF.parcelsN(earned.parcels), "package"],
                  [RF.foodN(earned.food), "utensils"],
                ] as const
              ).map(([l, ic]) => (
                <View key={ic} style={{ flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, backgroundColor: tokens.color.surface, borderRadius: 10 }}>
                  <Icon name={ic} size={15} color={tokens.color.muted} />
                  <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{l}</Text>
                </View>
              ))}
            </View>
          )}
          {range === "week" ? <WeekBars byDay={earned.byDay} todayIdx={(now.getDay() + 6) % 7} /> : null}
          {/* M9: no hint on an empty day (empty-states v2, D-78). */}
          {noJobs ? null : <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{R.earnHint}</Text>}
        </RCard>

        <View
          style={{
            borderRadius: 16,
            padding: 14,
            gap: 8,
            backgroundColor: danger ? tokens.color.dangerWash : tokens.color.bg,
            borderWidth: danger ? 0 : 1,
            borderColor: low ? tokens.color.danger : tokens.color.line,
          }}
        >
          <RLabel color={danger ? tokens.color.dangerInk : tokens.color.muted}>{R.balanceL}</RLabel>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {isLoading ? (
              <View style={{ flex: 1 }}>
                <ActivityIndicator color={tokens.color.muted} />
              </View>
            ) : (
              <Text style={{ flex: 1, fontSize: 28, fontWeight: tokens.font.weight.bold, color: danger ? tokens.color.dangerInk : tokens.color.ink, fontVariant: ["tabular-nums"] }}>{unreadable ? "—" : usd(balance)}</Text>
            )}
            <SmBtn kind="fill" icon="plus" label={R.topUp} onPress={() => router.push("/wallet/top-up")} />
          </View>
          {/* M9 draws the balance and Top up only; a low or blocked balance still says why. */}
          {unreadable && focused ? (
            <BalanceRetry onRetry={reread} />
          ) : noJobs && !danger && !low ? null : (
            <Text style={{ fontSize: 13, lineHeight: 19, color: danger ? tokens.color.dangerInk : tokens.color.ink, fontWeight: danger || low ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{balanceText}</Text>
          )}
        </View>

        {noJobs && owed === 0 ? null : foodOn ? (
          <CashSplit title={R.cashNow} yours={today.total} owed={owed} />
        ) : (
          <CashLine text={RF.cashOnly(today.total)} />
        )}

        <RLabel style={{ marginTop: 4 }}>{R.history}</RLabel>
        {foodOn && feed.length > 0 ? (
          <Chips
            list={[
              { id: "all", label: R.all },
              { id: "parcel", label: R.parcels },
              { id: "food", label: R.foodF },
            ]}
            value={filter}
            onChange={setFilter}
          />
        ) : null}
        {ledgerLoading ? (
          <SkeletonRows count={3} />
        ) : feed.length === 0 ? (
          // M9 — one quiet row (empty-states v2, D-78).
          <EmptyRow disc icon="receipt" text={emptyCopy.rider.noJobsToday} style={{ paddingVertical: 4 }} />
        ) : (
          <View>
            {groups.map((g) => (
              <View key={g.label}>
                <RLabel style={{ fontSize: 11, marginTop: 4, marginBottom: 2 }}>{g.label}</RLabel>
                {g.items.map((i, idx) => (
                  <LRow key={i.id} first={idx === 0} icon={itemIcon(i)} title={itemTitle(i)} meta={itemMeta(i)} amount={i.amount} />
                ))}
              </View>
            ))}
            {hasMore ? (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10 }}>
                <ActivityIndicator size={12} color={tokens.color.muted} />
                <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.loadsMore}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </AppScreen>
  );
}

/** MA-M6: a failed wallet read retries every 20 s and says so (rider screens have no Retry button). */
function BalanceRetry({ onRetry }: { onRetry: () => void }): React.ReactElement {
  const left = useAutoRetry(onRetry, 20);
  return <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.color.muted }}>{fillEmpty(emptyCopy.rider.retrying, { s: left })}</Text>;
}
