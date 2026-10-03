import { COMMISSION, formatPhoneLocal, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useMemo } from "react";
import { KeyboardAvoidingView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMe } from "../../src/api/auth";
import { isRiderRow, paidFare } from "../../src/logic/rider-earnings";
import { useRiderPrefs } from "../../src/logic/rider-prefs";
import { telUri } from "../../src/logic/safety";
import { useHistoryFeed } from "../../src/query/use-history-feed";
import { useWallet, useWalletConfig } from "../../src/query/use-wallet";
import { TopUpFlow } from "../../src/ui/rider/TopUpFlow";

/**
 * Rider top-up (Rider v2 T1–T6, `packages/design/handoff/rider-v2/`, ledger D-54): Provider → Amount →
 * Phone → Approve, prefilled from Settings › Top-up number. The flow (src/ui/rider/TopUpFlow.tsx) is a
 * view over the real intent API; this route feeds it the wallet config, the rider's default provider and
 * number, and an average fare for the amount hint. Back walks the steps, then leaves to Money.
 */
export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();
  const { wallet } = useWallet();
  const { prefs } = useRiderPrefs();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe }).data;
  const { rows } = useHistoryFeed();

  const avgFare = useMemo(() => {
    const fares = (rows ?? []).filter(isRiderRow).map(paidFare).filter((f): f is number => f != null);
    return fares.length ? fares.reduce((a, b) => a + b, 0) / fares.length : null;
  }, [rows]);

  const exit = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider/money");
  }, [router]);

  return (
    // TopUpFlow's header owns the top inset; this root owns the bottom one, so the CTA bar clears the
    // Android navigation bar (edge-to-edge is enforced at targetSdk 36). AppScreen's top-edge SafeAreaView
    // padded the top twice and left the bottom bare. The amount and phone fields lift with the keyboard.
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TopUpFlow
          minTopUp={config?.minTopUp ?? COMMISSION.minTopUp}
          maxTopUp={config?.maxTopUp ?? COMMISSION.maxTopUp}
          ratePct={config?.ratePct ?? 0}
          avgFare={avgFare}
          defaultProvider={prefs.topupProvider}
          defaultPhone={prefs.topupPhone ?? (me?.phone ? formatPhoneLocal(me.phone) : "")}
          balance={wallet?.balance ?? null}
          onExit={exit}
          onCallSupport={() => {
            const uri = telUri(SOS_POLICY.safetyLine);
            if (uri) void Linking.openURL(uri);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
