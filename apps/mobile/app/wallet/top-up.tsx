import { COMMISSION, tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useWalletConfig } from "../../src/query/use-wallet";
import { Heading, Icon, Screen } from "../../src/ui";
import { TopUpFlow } from "../../src/ui/rider/TopUpFlow";

/**
 * Rider top-up (kit `rider-screens-wallet.jsx`: amount → wait → success/declined).
 *
 * This screen has been three things. It is worth knowing which one you are looking at:
 *
 *  1. A self-serve form that ALWAYS failed. `POST /wallet/topups` opens a real intent, but
 *     `WalletService.creditFromTopup` — the only path that can confirm one — had no caller, so every
 *     attempt ran the 90s window down and landed on "The request expired". A live, user-facing,
 *     permanently-broken money flow (`DOC-16-02` in docs/KNOWN_BUGS.md).
 *  2. Then a "call support to top up" screen, and later a mock of the kit's four screens — honest
 *     about the missing rail, but not a client of anything.
 *  3. Now (2026-08-13, owner instruction: *"assume the rail will be fully implemented and i want the
 *     set up like its fully implemented"*) the REAL client again — but complete this time, which is
 *     what state 1 never was: idempotent creation, server-driven outcome, a durable `PendingTopup`
 *     marker so an app kill mid-wait is recoverable, and balance/ledger invalidation on a
 *     server-reported success.
 *
 * The difference between 1 and 3 is not the rail — that is still missing — it is that nothing here
 * pretends. A success renders only when the server says `succeeded`, an expiry is labelled an expiry,
 * and the support-call route that actually credits a balance today is on the screen throughout. When a
 * rail lands and calls `creditFromTopup`, this starts working with no change to the app.
 *
 * See `src/ui/rider/TopUpFlow.tsx` and `docs/PAYMENT-RAIL-OUTSTANDING.md`.
 */
export default function TopUpScreen(): React.ReactElement {
  const router = useRouter();
  const { config } = useWalletConfig();

  // The back row the kit draws above this heading (`rider-screens-wallet.jsx:111`) and the app had
  // dropped. Without it the ENTRY state — amount + rail picker — had no exit at all: `TopUpFlow` only
  // offers "Back to Money" once a request is pending, has succeeded, or has failed, this route is
  // pushed from the Money tab so no tab bar shows, and both stacks run headerShown:false. A rider who
  // opened Top up and changed their mind had to submit a payment to get out. Placed here rather than
  // inside TopUpFlow so it covers every state of the flow, at the mock's own position.
  const exit = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/rider/money");
  }, [router]);

  return (
    <Screen>
      {/* Kit geometry verbatim: 13px/600 muted label, 17px chevron 2px to its left, 12px below the row.
          The kit labels the destination "Wallet"; the shipped rider IA is RJM (Jobs · Money · Account)
          and `RJ wallet` is a RETIRED screen id, so the label follows the tab the rider actually
          returns to — see ledger D-17. */}
      <Pressable
        onPress={exit}
        accessibilityRole="button"
        accessibilityLabel="Back to Money"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", marginBottom: 12, alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
      >
        {/* Rotation on a wrapper View, not the glyph's own style: an SVG-level transform survives
            react-native-svg but is dropped by the react-native-web build the parity renderer uses,
            which would ship a chevron pointing the wrong way (same trap as D-14). */}
        <View style={{ transform: [{ rotate: "180deg" }], marginRight: 2 }}>
          <Icon name="chevron-right" size={17} color={tokens.color.muted} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.color.muted }}>Money</Text>
      </Pressable>
      <Heading>Top up</Heading>
      <TopUpFlow
        minTopUp={config?.minTopUp ?? COMMISSION.minTopUp}
        maxTopUp={config?.maxTopUp ?? COMMISSION.maxTopUp}
        onExit={() => router.back()}
      />
    </Screen>
  );
}
