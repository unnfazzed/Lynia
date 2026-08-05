import { COMMISSION, tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useWallet, useWalletConfig } from "../../src/query/use-wallet";
import { SupportCallRow } from "../../src/ui/safety";
import { Button, Card, Heading, Icon, isTestBuild, Screen, Sub } from "../../src/ui";
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
 * ─── TEST BUILD ONLY: the kit's top-up flow, as a labelled walkthrough ────────────────────────────
 * None of the above changes. The rail still doesn't exist, and a real release build renders exactly the
 * "call support" screen below — that is still the product's behaviour. What `isTestBuild()` adds is a
 * walkable mock-up of the four screens the kit specifies (`rider-screens-wallet.jsx`: amount → wait →
 * approved/declined) so internal testers can review the flow before the rail lands. It makes no network
 * call, moves no money, and stamps a SIMULATED strip on every step including the terminals — see
 * `src/ui/rider/TopUpSimulator.tsx` for the full reasoning. `isTestBuild()` is false in any EAS release
 * (app.config.ts only sets `extra.testBuild` from the android-test-apk workflow's env), so the
 * simulator cannot ship to a rider.
 */
export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();
  const { wallet } = useWallet();

  if (isTestBuild()) {
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
