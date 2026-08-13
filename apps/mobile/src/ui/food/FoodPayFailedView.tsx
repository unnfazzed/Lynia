import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, EmptyState, Icon, OfflineBanner, Screen } from "../index";
import { OrderHeader } from "./FoodOrderHelpers";

/** The rails a Harare customer actually pays a merchant number from (kit `RAILS`, r-parts.jsx:50).
 *  None of these is an INTEGRATION — LyniaGo sends no prompt to any of them. Picking one here means
 *  "I'll dial that rail's USSD myself", which is why every row lands on the manual rail + reference
 *  form rather than pretending to hand off to a provider. */
const RAILS = ["EcoCash", "InnBucks", "O'mari"] as const;

/**
 * R5·b2 (r-customer-b.jsx:218) — "The payment was declined": the rail said no, so name the honest
 * cause, offer the other rails, and keep a single retry.
 *
 * ⚠️ THE PAYMENT RAIL DOES NOT EXIST — there is no decline callback in this codebase any more than
 * there is a prompt-send endpoint. This screen is reachable only through the transition gated by
 * `usePaymentSimulation()`, and since 2026-08-12 it carries no on-screen marker saying so (the owner
 * removed every SIMULATED/PREVIEW label, accepting the risk), so the server flag is the only control
 * over it.
 *
 * This is the safest of the unbacked screens: it states a FAILURE, never a success, so the worst it
 * can do is send someone to the manual rail — which is the real path regardless.
 */
export function FoodPayFailedView({
  restaurantName,
  amount,
  reachable,
  onTryAgain,
  onPayManually,
}: {
  restaurantName: string;
  amount: number;
  reachable: boolean;
  /** Kit footer: "Try again · $X" — back to the prompt wait. */
  onTryAgain: () => void;
  /** Any alternate rail lands on the manual rail: copy the merchant number, dial the USSD, come back
   *  with the reference. That is genuinely how you'd pay with any of these today. */
  onPayManually: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Payment declined" pillTone="neutral" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <EmptyState
          icon="circle-alert"
          title="The payment was declined"
          message="No money left your account. Usually the balance was too low, or the prompt was declined on the phone."
        />
        {/* Kit R5·b2 (r-customer-b.jsx:225): the alternate-rail list under an "OR PAY WITH" micro-label. */}
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.muted, marginTop: tokens.space.md, marginBottom: 7 }}>
          OR PAY WITH
        </Text>
        {RAILS.map((rail) => (
          <Pressable
            key={rail}
            onPress={onPayManually}
            accessibilityRole="button"
            accessibilityLabel={`Pay with ${rail} — dial their USSD, then enter your reference`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              minHeight: tokens.touchTargetMin,
              padding: tokens.space.md,
              borderRadius: tokens.radius.input,
              borderWidth: 1,
              borderColor: tokens.color.line,
              backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
              marginBottom: tokens.space.sm,
            })}
          >
            {/* No rail logos ship in this app (the kit's are web assets), so the tile carries the wallet
                glyph rather than a fabricated brand mark. */}
            <View
              style={{
                width: 56,
                height: 34,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: tokens.color.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="wallet" size={18} color={tokens.color.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>{rail}</Text>
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 1 }}>Dial their USSD, then enter your reference</Text>
            </View>
            <Icon name="chevron-right" size={18} color={tokens.color.muted} />
          </Pressable>
        ))}
        <View style={{ height: tokens.space.xl }} />
      </ScrollView>
      <Button label={`Try again · ${formatMoney(amount)}`} onPress={onTryAgain} />
    </Screen>
  );
}
