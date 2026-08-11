import { tokens, type WalletEntry } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { getFoodOrderAsRider } from "../../../src/api/food-rider";
import { getActiveOrder } from "../../../src/api/orders";
import { getTopup } from "../../../src/api/wallet";
import { clearPendingTopup, loadPendingTopup } from "../../../src/auth/session";
import { fmtDateTime } from "../../../src/logic/format-time";
import { formatMoney } from "../../../src/logic/money";
import { reconcilePendingTopup } from "../../../src/logic/topup";
import { filterLedgerEntries, type LedgerFilter } from "../../../src/logic/wallet-ledger";
import { useWallet, useWalletConfig, useWalletLedger, walletKey, walletLedgerKey } from "../../../src/query/use-wallet";
import { AppScreen, Button, Card, EmptyState, Heading, Icon, SkeletonRows } from "../../../src/ui";
import { CashHeldStrip } from "../../../src/ui/rider/CashHeldStrip";

/** One ledger receipt. A debit renders in ink (never red text on white); a credit in the text-green.
 *  Commission debits show the checkable math the server stored ("10% of $3.00"). */
function LedgerRow({ entry }: { entry: WalletEntry }): React.ReactElement {
  const credit = entry.amount >= 0;
  const amountColor = credit ? tokens.color.accentText : tokens.color.ink;
  const sign = credit ? "+" : "−";
  // Every commission row today is provably parcel-sourced (see wallet-ledger.ts) — the icon says so
  // honestly rather than guessing; non-commission rows (top-up/grace/adjustment) get a neutral mark.
  const iconName = entry.type !== "commission" ? "banknote" : "package";
  return (
    <View
      accessibilityLabel={`${entry.title}, ${entry.meta}, ${credit ? "credit" : "debit"} ${formatMoney(Math.abs(entry.amount))}, ${fmtDateTime(entry.createdAt)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, paddingVertical: tokens.space.sm }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon name={iconName} size={16} color={tokens.color.muted} />
      </View>
      <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
          {entry.meta ? `${entry.meta} · ` : ""}
          {fmtDateTime(entry.createdAt)}
        </Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: amountColor, fontVariant: ["tabular-nums"] }}>
        {sign}
        {formatMoney(Math.abs(entry.amount))}
      </Text>
    </View>
  );
}

const LEDGER_FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "parcel", label: "Parcels" },
  { id: "food", label: "Food" },
];

function FilterChips({ value, onChange }: { value: LedgerFilter; onChange: (f: LedgerFilter) => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: tokens.space.sm }}>
      {LEDGER_FILTERS.map((f) => {
        const on = f.id === value;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: tokens.radius.pill,
              backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
              borderWidth: 1,
              borderColor: on ? tokens.color.accent : tokens.color.line,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: on ? tokens.color.accentText : tokens.color.muted }}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * UX-2026-07-16: recovery surface for `session.ts`'s durable `PendingTopup` marker — an app kill during
 * top-up.tsx's "wait" step previously lost all UI state with no way to tell whether the top-up landed.
 * On mount, resolve any marker against the server's own `getTopup` and clear it once the outcome is
 * known; a still-pending intent keeps the marker so this runs again next time the Money tab is opened.
 */
type PendingTopupBanner = { kind: "succeeded"; amount: number } | { kind: "pending" } | { kind: "terminal" };
function usePendingTopupReconciliation(): PendingTopupBanner | null {
  const qc = useQueryClient();
  const [banner, setBanner] = React.useState<PendingTopupBanner | null>(null);

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
          setBanner({ kind: "succeeded", amount: topup.amount });
        } else if (outcome === "terminal") {
          void clearPendingTopup();
          setBanner({ kind: "terminal" });
        } else {
          setBanner({ kind: "pending" });
        }
      } catch {
        /* transient — the marker stays, so this retries next time the Money tab mounts */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  return banner;
}

/**
 * Money tab (plan §5 B3): `app/wallet/*` + `app/earnings/*` merged into one screen — balance +
 * commission, the "yours" vs "owed to a kitchen" cash-held split (RIDER-ONE-APP-PLAN.md decision 6,
 * always zero here — see `CashHeldStrip`'s doc comment), one earnings ledger filterable Parcel /
 * Food, and the top-up CTA. The standalone `/wallet` and `/earnings` screens are retired outright
 * (gallery-map.js: "RJ wallet — replaced by the merged Money tab", "RJ earnings — retired"); the old
 * "record of work done" lifetime total is retired with them (decision 1, weekly-settlement model
 * gone) rather than ported — the ledger below is the record now.
 */
export default function RiderMoneyTabScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { config } = useWalletConfig();
  const { wallet, isLoading, isFetching, isError, refetch } = useWallet();
  const {
    entries: allEntries,
    isLoading: ledgerLoading,
    refetch: refetchLedger,
    hasMore: hasMoreLedger,
    isLoadingMore: ledgerLoadingMore,
    loadMore: loadMoreLedger,
  } = useWalletLedger();
  const pendingTopupBanner = usePendingTopupReconciliation();
  const [filter, setFilter] = React.useState<LedgerFilter>("all");

  // D5: "owed to a kitchen" — one job at a time (§7 open Q1), so this is just the single active food
  // job's own open debt, not a separate aggregate endpoint. Shares the ["activeJob"] cache key with the
  // board/job screens (no extra round-trip if either already warmed it).
  const activeJobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder });
  const activeJob = activeJobQ.data ?? null;
  const foodDebtQ = useQuery({
    queryKey: ["foodOrderAsRider", activeJob?.id],
    queryFn: () => getFoodOrderAsRider(activeJob!.id),
    enabled: activeJob?.orderType === "merchant",
  });
  const owed = activeJob?.orderType === "merchant" && foodDebtQ.data?.debtStatus === "open" ? (foodDebtQ.data.debtAmount ?? 0) : 0;

  // Same reasoning the old wallet screen used: a support-credit is the rider's only working top-up
  // path at launch, so refetch on every focus rather than trusting the global refetchOnWindowFocus:false.
  useFocusEffect(
    React.useCallback(() => {
      void qc.invalidateQueries({ queryKey: walletKey });
      void qc.invalidateQueries({ queryKey: walletLedgerKey });
    }, [qc]),
  );

  const floor = config?.floor ?? 2;
  const balance = wallet?.balance ?? 0;
  const entries = filterLedgerEntries(allEntries, filter);
  const belowFloor = balance < floor;
  const gettingLow = !belowFloor && balance < floor + 1;
  const negative = balance < 0;
  const firstOpen = allEntries.length === 1 && allEntries[0]!.type === "grace";

  // RJM M1 healthy state is an accent-BORDERED white card (Card accent), not a solid-green fill: a
  // muted uppercase "COMMISSION BALANCE" eyebrow, the balance in ink, and the commission line + Top up
  // living inside it. The low/negative states (not drawn by M1 — RJM.gate_topup is the empty gate) keep
  // the dangerWash treatment so a real money block still reads as danger.
  // The accent hero and the dangerWash low/negative hero both sit on light fills, so ink + muted read
  // in either — the difference is the card's fill/border (accent vs dangerWash), set on the Card below.
  const heroBad = negative || belowFloor;
  const heroTextColor = tokens.color.ink;
  const heroSubColor = tokens.color.muted;

  return (
    <AppScreen>
      <View style={{ flex: 1, paddingHorizontal: tokens.space.screen }}>
        <Heading>Money</Heading>

        {isLoading ? (
          <SkeletonRows count={4} />
        ) : isError && wallet == null ? (
          <EmptyState icon="wifi-off" title="Couldn't load your balance" message="Check your connection and try again.">
            <Button label="Retry" onPress={refetch} loading={isFetching} />
          </EmptyState>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isFetching}
                onRefresh={() => {
                  refetch();
                  refetchLedger();
                }}
                tintColor={tokens.color.muted}
              />
            }
          >
            {isError && wallet != null ? (
              <Text style={{ fontSize: 12, color: tokens.color.muted, marginBottom: tokens.space.sm }}>
                Couldn&apos;t refresh just now — showing your last known balance. Pull down to try again.
              </Text>
            ) : null}
            {pendingTopupBanner ? (
              <Card
                style={{
                  backgroundColor: pendingTopupBanner.kind === "terminal" ? tokens.color.dangerWash : tokens.color.highlightWash,
                  borderColor: pendingTopupBanner.kind === "terminal" ? tokens.color.dangerWash : tokens.color.highlightBorder,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>
                  {pendingTopupBanner.kind === "succeeded"
                    ? `Added ${formatMoney(pendingTopupBanner.amount)}`
                    : pendingTopupBanner.kind === "pending"
                      ? "A top-up is still waiting for approval"
                      : "Your last top-up didn't go through"}
                </Text>
                <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
                  {pendingTopupBanner.kind === "succeeded"
                    ? "It landed while the app was closed — your balance below is up to date."
                    : pendingTopupBanner.kind === "pending"
                      ? "Check your phone for the payment prompt, or start a new one from Top up."
                      : "No money moved — you can start a fresh top-up whenever you're ready."}
                </Text>
              </Card>
            ) : null}

            {/* Balance hero (RJM M1): accent-bordered white card, uppercase muted eyebrow, ink
                balance, the commission line + Top up inside it. Low/negative keeps the dangerWash. */}
            <Card accent={!heroBad} style={heroBad ? { backgroundColor: tokens.color.dangerWash, borderColor: tokens.color.dangerWash } : undefined}>
              <Text style={{ color: heroSubColor, fontSize: 12, fontWeight: "700", letterSpacing: 0.4 }}>
                {firstOpen ? "GRACE CREDIT · BALANCE" : "COMMISSION BALANCE"}
              </Text>
              <Text style={{ color: heroTextColor, fontSize: 28, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }}>
                {formatMoney(balance)}
              </Text>
              {negative ? (
                <Text style={{ color: heroSubColor, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>You owe this — your next top-up clears it first.</Text>
              ) : belowFloor ? (
                <Text style={{ color: heroSubColor, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>Below the ${floor.toFixed(2)} floor — top up to keep riding.</Text>
              ) : gettingLow ? (
                <Text style={{ color: heroSubColor, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>Getting low — top up soon so you don&apos;t get blocked.</Text>
              ) : (
                <Text style={{ color: heroSubColor, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
                  {config && config.ratePct > 0
                    ? `${config.ratePct}% comes off this balance when a job closes — parcels and food, same rate. Run it to zero and you can't go online.`
                    : "No commission comes off yet — you keep the full agreed fare. When that changes, the same small per-job commission comes off this balance for parcels and food alike."}
                </Text>
              )}
              <Button label="Top up" onPress={() => router.push("/wallet/top-up")} />
            </Card>

            {/* Cash held — RIDER-ONE-APP-PLAN.md decision 6. "owed" is now live (D5) — the single
                active food job's own open debt. "yours" stays 0 here: the active-job screen is where a
                specific job's kept fare shows; this tab's "yours" has no single job to point at once
                more than a parcel and a food job could theoretically both contribute (not modeled). */}
            <View style={{ marginTop: tokens.space.md }}>
              <CashHeldStrip yours={0} owed={owed} />
            </View>

            {/* Ledger — filter chips then bare hairline-divided rows (RJM M1: no "History" label, no
                card wrapper; the rows sit directly on the page). */}
            <View style={{ marginTop: tokens.space.lg }}>
              <FilterChips value={filter} onChange={setFilter} />
              {ledgerLoading ? (
                <SkeletonRows count={3} />
              ) : entries.length === 0 ? (
                <EmptyState
                  icon="banknote"
                  title={filter === "food" ? "No food deliveries yet" : "Nothing here yet"}
                  message={
                    filter === "food"
                      ? "Food commission isn't live yet — once it is, food jobs will show up here next to their delivery."
                      : filter === "parcel"
                        ? "Your parcel history starts with your next ride — every deduction shows up here next to the delivery it came from."
                        : "Your commission history starts with your next ride — every deduction shows up here next to the delivery it came from."
                  }
                />
              ) : (
                entries.map((e) => (
                  <View key={e.id} style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
                    <LedgerRow entry={e} />
                  </View>
                ))
              )}
              {/* LC-B-SIB-2: the server caps every page at 25 entries; before this, `nextCursor` was
                  never read, so older deductions vanished with no signal anything was missing. */}
              {!ledgerLoading && hasMoreLedger ? (
                <View style={{ marginTop: tokens.space.sm }}>
                  <Button label="Load older" variant="ghost" onPress={loadMoreLedger} loading={ledgerLoadingMore} />
                </View>
              ) : null}
            </View>

            <View style={{ height: tokens.space.xxl }} />
          </ScrollView>
        )}
      </View>
    </AppScreen>
  );
}
