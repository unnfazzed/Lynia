import { COMMISSION, tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useWallet, useWalletConfig } from "../../src/query/use-wallet";
import { SupportCallRow } from "../../src/ui/safety";
import { Button, Card, Heading, Icon, Screen, Sub } from "../../src/ui";
import { usePaymentSimulation } from "../../src/ui/payment-simulation";
import { TopUpSimulator } from "../../src/ui/rider/TopUpSimulator";

/**
 * DOC-16-02 (docs/KNOWN_BUGS.md): self-serve top-up on all three rails (EcoCash/InnBucks/O'mari)
 * previously guaranteed a 90s timeout — `WalletService.creditFromTopup`, the ONLY code path that ever
 * confirms a `TopUp` and credits the balance, has zero callers anywhere (no rail integration exists, and
 * none was ever wired to call it). The old screen collected an amount/phone/rail, opened a "Check your
 * phone" countdown, and always landed on "The request expired" — a real, live, permanently-broken money
 * flow (WALLET_REVEAL defaults true, so real riders hit this).
 *
 * Per the design brief's own UI spec, only EcoCash was ever meant to get a real self-serve form —
 * InnBucks/O'mari were always the "instruction card" / manual-credit path (`packages/shared/src/contracts.ts`
 * `TopupRail` doc: "manual is an ops-recorded credit... the launch rail for InnBucks/O'mari and the
 * fallback for EcoCash"). Since the EcoCash integration was never built either, ALL THREE rails route
 * here until a real rail integration lands and calls `creditFromTopup` — an honest instruction screen
 * pointing at the ALREADY-WORKING admin manual-credit path (`POST /admin/riders/:id/wallet-credit` →
 * `WalletService.creditManual`), instead of a self-serve form that could never succeed.
 *
 * ─── THE KIT'S TOP-UP FLOW, SHIPPED AS A LABELLED PREVIEW ─────────────────────────────────────────
 * None of the above changes. The rail still doesn't exist and still moves no money. What the preview
 * adds is a walkable rendering of the four screens the kit specifies (`rider-screens-wallet.jsx`:
 * amount → wait → approved/declined) so the flow is reviewable before the rail lands.
 *
 * It was QA-APK-only until 2026-08-12, when the owner asked for it in the shipping build ahead of
 * launch. It is now opened by `usePaymentSimulation()` — the QA APK OR the `paymentSimulationEnabled`
 * server flag, which is ON by default and retractable in ~1 minute with no app update. Everything that
 * made it safe is unchanged and is now unconditional rather than build-gated: no network call, no
 * `TopUp` row, no ledger write, a PREVIEW strip on every step including the terminals, and no path
 * that resolves itself into a success.
 *
 * The support-call card below stays the honest fallback whenever the gate is shut — and, because it is
 * the ONLY way a balance actually moves today, the preview keeps its own route to it rather than
 * burying it (see `TopUpSimulator`'s amount step).
 */
export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();
  const { wallet } = useWallet();
  const simulationEnabled = usePaymentSimulation();

  if (simulationEnabled) {
    return (
      <Screen>
        <Heading>Top up</Heading>
        <TopUpSimulator
          balance={wallet?.balance ?? null}
          minTopUp={config?.minTopUp ?? COMMISSION.minTopUp}
          maxTopUp={config?.maxTopUp ?? COMMISSION.maxTopUp}
          onExit={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>Top up</Heading>
      <Sub>Add to your prepaid commission balance.</Sub>

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: tokens.space.lg }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: tokens.color.highlightWash,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: tokens.space.md,
          }}
        >
          <Icon name="phone" size={36} color={tokens.color.highlightInk} strokeWidth={1.75} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>
          Top up by contacting support
        </Text>
        <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
          Self-serve top-up isn&apos;t available yet. Call support, tell them how much you&apos;d like to add, and
          they&apos;ll confirm your payment and credit your balance directly — no money moves until they do.
        </Text>

        <Card style={{ alignSelf: "stretch", marginTop: tokens.space.lg, backgroundColor: tokens.color.surface }}>
          <SupportCallRow label="Top up" name="LyniaGo support" />
        </Card>

        <View style={{ alignSelf: "stretch", marginTop: tokens.space.xl }}>
          <Button label="Back to Money" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
