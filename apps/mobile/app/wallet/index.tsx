import { tokens, type WalletEntry } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { getTopup } from "../../src/api/wallet";
import { clearPendingTopup, loadPendingTopup } from "../../src/auth/session";
import { formatMoney } from "../../src/logic/money";
import { reconcilePendingTopup } from "../../src/logic/topup";
import { useWallet, useWalletConfig, useWalletLedger, walletKey, walletLedgerKey } from "../../src/query/use-wallet";
import { Button, Card, EmptyState, Heading, Screen, SkeletonRows, Sub } from "../../src/ui";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

/** One ledger receipt. A debit renders in ink (never red text on white); a credit in the text-green.
 *  Commission debits show the checkable math the server stored ("10% of $3.00"). */
function LedgerRow({ entry }: { entry: WalletEntry }): React.ReactElement {
  const credit = entry.amount >= 0;
  const amountColor = credit ? tokens.color.accentText : tokens.color.ink;
  const sign = credit ? "+" : "−";
  return (
    <View
      accessibilityLabel={`${entry.title}, ${entry.meta}, ${credit ? "credit" : "debit"} ${formatMoney(Math.abs(entry.amount))}, ${fmtWhen(entry.createdAt)}`}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: tokens.space.sm }}
    >
      <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
          {entry.meta ? `${entry.meta} · ` : ""}
          {fmtWhen(entry.createdAt)}
        </Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: amountColor, fontVariant: ["tabular-nums"] }}>
        {sign}
        {formatMoney(Math.abs(entry.amount))}
      </Text>
    </View>
  );
}

/**
 * UX-2026-07-16: recovery surface for `session.ts`'s durable `PendingTopup` marker — an app kill during
 * top-up.tsx's "wait" step (sent out to another app to approve the rail prompt) previously lost all UI
 * state with no way to tell whether the top-up landed. On mount, resolve any marker against the server's
 * own `getTopup` and clear it once the outcome is known; a still-pending intent keeps the marker so this
 * runs again next time the rider opens the wallet.
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
        /* transient — the marker stays, so this retries next time the wallet screen mounts */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  return banner;
}

export default function WalletScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();
  const { wallet, isLoading, isFetching, isError, refetch } = useWallet();
  const { page, isLoading: ledgerLoading } = useWalletLedger();
  const pendingTopupBanner = usePendingTopupReconciliation();

  const floor = config?.floor ?? 2;
  const balance = wallet?.balance ?? 0;
  const entries = page?.entries ?? [];
  const belowFloor = balance < floor;
  const gettingLow = !belowFloor && balance < floor + 1;
  const negative = balance < 0;
  // First-open (flip day): the account exists only because of the grace credit — a single credit row.
  const firstOpen = entries.length === 1 && entries[0]!.type === "grace";

  // Hero surface: neutral cta-green normally; danger-wash when the balance is negative/below the floor
  // (amount stays ink, never red text on white).
  const heroBad = negative || belowFloor;
  const heroBg = heroBad ? tokens.color.dangerWash : tokens.color.cta;
  const heroTextColor = heroBad ? tokens.color.ink : tokens.color.onAccent;
  const heroSubColor = heroBad ? tokens.color.muted : tokens.color.onAccent;

  return (
    <Screen>
      <Heading>Commission wallet</Heading>
      <Sub>Your prepaid balance — commission comes out of this, never your cash in hand.</Sub>

      {isLoading ? (
        <SkeletonRows count={4} />
      ) : isError && wallet == null ? (
        <EmptyState icon="wifi-off" title="Couldn't load your wallet" message="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} loading={isFetching} />
        </EmptyState>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
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
          {/* Balance hero */}
          <Card style={{ backgroundColor: heroBg, borderColor: heroBg }}>
            <Text style={{ color: heroSubColor, fontSize: 12, fontWeight: "600", opacity: heroBad ? 1 : 0.9 }}>
              {firstOpen ? "Grace credit · balance" : "Commission balance"}
            </Text>
            <Text style={{ color: heroTextColor, fontSize: 32, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {formatMoney(balance)}
            </Text>
            {negative ? (
              <Text style={{ color: heroSubColor, fontSize: 12, marginTop: 4 }}>
                You owe this — your next top-up clears it first.
              </Text>
            ) : belowFloor ? (
              <Text style={{ color: heroSubColor, fontSize: 12, marginTop: 4 }}>
                Below the ${floor.toFixed(2)} floor — top up to keep riding.
              </Text>
            ) : gettingLow ? (
              <Text style={{ color: heroSubColor, fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                Getting low — top up soon so you don&apos;t get blocked.
              </Text>
            ) : firstOpen ? (
              <Text style={{ color: heroSubColor, fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                We&apos;ve added this to get you started.
              </Text>
            ) : null}
          </Card>

          {/* The one primary CTA on the screen */}
          <Button label="Top up" onPress={() => router.push("/wallet/top-up")} />

          {/* Ledger */}
          <View style={{ marginTop: tokens.space.lg }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: tokens.space.sm }}>
              History
            </Text>
            {ledgerLoading ? (
              <SkeletonRows count={3} />
            ) : entries.length === 0 ? (
              <EmptyState
                icon="banknote"
                title="Nothing here yet"
                message="Your commission history starts with your next ride — every deduction shows up here next to the delivery it came from."
              />
            ) : (
              <Card>
                {entries.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: tokens.color.line }} /> : null}
                    <LedgerRow entry={e} />
                  </View>
                ))}
              </Card>
            )}
          </View>

          {/* Honest-copy card */}
          <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: tokens.color.highlightBorder }}>
            <Text style={{ fontSize: 12, color: tokens.color.highlightInk, lineHeight: 18 }}>
              {config && config.ratePct > 0
                ? `LyniaGo takes ${config.ratePct}% of each delivery, out of the balance you top up in advance — never the cash the customer hands you. Every deduction sits next to the ride it came from, so you can always check the math.`
                : "LyniaGo doesn't take a commission yet — you keep the full agreed fare. When that changes, a small per-ride commission will come out of this prepaid balance, and every deduction will be shown here next to its ride."}
            </Text>
          </Card>

          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
