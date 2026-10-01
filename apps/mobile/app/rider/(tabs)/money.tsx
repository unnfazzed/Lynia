import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, Text, View } from "react-native";
import { getFoodOrderAsRider } from "../../../src/api/food-rider";
import { getActiveOrder } from "../../../src/api/orders";
import { getTopup } from "../../../src/api/wallet";
import { clearPendingTopup, loadPendingTopup } from "../../../src/auth/session";
import { buildMoneyFeed, filterMoneyFeed, type MoneyItem, oldestHistoryAt } from "../../../src/logic/money-feed";
import { groupByDay, type ServiceFilter, summarise } from "../../../src/logic/rider-earnings";
import { reconcilePendingTopup } from "../../../src/logic/topup";
import { useNow } from "../../../src/logic/use-now";
import { useFeatureFlags } from "../../../src/net/use-feature-flags";
import { useHistoryFeed } from "../../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../../src/realtime/use-foreground-refetch";
import { useWallet, useWalletConfig, useWalletLedger, walletKey, walletLedgerKey } from "../../../src/query/use-wallet";
import { AppScreen, Icon, SkeletonRows } from "../../../src/ui";
import { IconDisc, SmBtn } from "../../../src/ui/order/kit";
import { Notice } from "../../../src/ui/send/kit";
import { hhmm, RIDER_COPY as R, RF, usd } from "../../../src/ui/rider/copy";
import { CashLine, CashSplit, Chips, LRow, MintTop, RCard, RLabel, Seg } from "../../../src/ui/rider/kit";
import { useTabTop } from "../../../src/query/use-tab-top";
import type { IconName } from "../../../src/ui";

/**
 * Recovery for `session.ts`'s durable `PendingTopup` marker (UX-2026-07-16): an app kill during the
 * top-up wait lost all UI state. On mount, resolve any marker against the server and clear it once
 * the outcome is known; a still-pending intent keeps the marker so this runs again next time.
 */
type PendingTopupNotice = { kind: "succeeded"; amount: number } | { kind: "pending"; provider: string } | { kind: "terminal" };
function usePendingTopupReconciliation(): PendingTopupNotice | null {
  const qc = useQueryClient();
  const [notice, setNotice] = React.useState<PendingTopupNotice | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const marker = await loadPendingTopup();
      if (!marker || cancelled) return;
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
          setNotice({ kind: "terminal" });
        } else {
          setNotice({ kind: "pending", provider: topup.rail === "innbucks" ? "InnBucks" : topup.rail === "omari" ? "O'mari" : "EcoCash" });
        }
      } catch {
        /* transient — the marker stays, so this retries next time the Money tab mounts */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);
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
  const qc = useQueryClient();
  const top = useTabTop();
  const now = useNow();
  const { merchantDispatchAutoEnabled: foodOn } = useFeatureFlags();
  const { config } = useWalletConfig();
  const { wallet, isLoading, isError } = useWallet();
  const { entries, isLoading: ledgerLoading, hasMore, isLoadingMore, loadMore } = useWalletLedger();
  const { rows: history } = useHistoryFeed();
  const pending = usePendingTopupReconciliation();
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
  React.useEffect(() => {
    if (!focused || !isError) return;
    const t = setInterval(reread, 20_000);
    return () => clearInterval(t);
  }, [focused, isError, reread]);

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
  const owes = balance < 0;
  const belowFloor = !owes && balance < floor;
  const low = !owes && !belowFloor && balance < floor + 1;
  const danger = owes || belowFloor;
  const balanceText = owes ? R.owesB : belowFloor ? RF.floorB(floor) : low ? R.lowB : rate > 0 ? RF.balanceB(rate, floor) : R.balanceB0;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (hasMore && !isLoadingMore && layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) loadMore();
  };

  const noJobs = earned.jobs === 0;

  return (
    <AppScreen banner={<MintTop {...top} />}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={200}>
        {pending ? (
          pending.kind === "succeeded" ? (
            <Notice tone="wash" icon="circle-check" text={RF.pendingOk(pending.amount)} />
          ) : pending.kind === "pending" ? (
            <Notice icon="hourglass" text={RF.pendingWait(pending.provider)} />
          ) : (
            <Notice icon="circle-alert" text={RF.pendingFail} />
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
          <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{noJobs ? R.emptyMoneyB : R.earnHint}</Text>
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
              <Text style={{ flex: 1, fontSize: 28, fontWeight: tokens.font.weight.bold, color: danger ? tokens.color.dangerInk : tokens.color.ink, fontVariant: ["tabular-nums"] }}>{usd(balance)}</Text>
            )}
            <SmBtn kind="fill" icon="plus" label={R.topUp} onPress={() => router.push("/wallet/top-up")} />
          </View>
          <Text style={{ fontSize: 13, lineHeight: 19, color: danger ? tokens.color.dangerInk : tokens.color.ink, fontWeight: danger || low ? tokens.font.weight.semibold : tokens.font.weight.regular }}>{balanceText}</Text>
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
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 8 }}>
            <IconDisc name="receipt" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{R.emptyMoneyT}</Text>
              <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{R.emptyMoneyB}</Text>
            </View>
          </View>
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
