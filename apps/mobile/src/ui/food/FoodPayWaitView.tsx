import { formatPhoneLocal, tokens } from "@lynia/shared";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Icon, OfflineBanner, Screen } from "../index";
import { SimulatedPathNotice } from "./SimulatedPathNotice";

/**
 * R5·4 (r-customer-b.jsx:116) — "Check your phone": the rail prompt has gone out and we're waiting
 * for the customer to approve it on their handset.
 *
 * ⚠️ THE PAYMENT RAIL DOES NOT EXIST. There is no prompt-send endpoint in this codebase (see
 * ManualPayRail / FoodOrderAwaitingPaymentView: the shipped path is USSD + "submit my reference",
 * matched by the merchant against their own statement). This screen is therefore reachable only
 * through the preview transition gated by `usePaymentSimulation()` — the QA APK plus a server kill
 * switch — and it paints {@link SimulatedPathNotice} above its own hero saying so in as many words.
 * That notice is unconditional: there is no build or flag state in which this screen renders without
 * it.
 *
 * It is a WAIT state and nothing more: it never asserts that money moved, and there is deliberately
 * no simulated success anywhere — the only way this order can become "paid" is still the customer
 * submitting a real reference from a real transfer.
 */
export function FoodPayWaitView({
  restaurantName,
  amount,
  merchantPaymentPhone,
  reachable,
  onEnterReference,
  onSimulateDecline,
}: {
  restaurantName: string;
  amount: number;
  /** The merchant's own receiving number — the one true fact we can state about where money goes. */
  merchantPaymentPhone: string | null;
  reachable: boolean;
  /** Back to the real, working path: the manual rail + reference form. */
  onEnterReference: () => void;
  /** Walk on to R5·b2 (declined). Undefined when the caller has no decline preview to offer; the
   *  screen is already unreachable unless the preview gate is open. */
  onSimulateDecline?: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <SimulatedPathNotice what="no payment prompt was sent" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: tokens.color.accentWash,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: tokens.space.md,
            }}
          >
            <Icon name="phone" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>Check your phone</Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 290, lineHeight: 20 }}>
            Approve the mobile-money prompt on your handset to pay {restaurantName}
            {merchantPaymentPhone ? ` on ${formatPhoneLocal(merchantPaymentPhone)}` : ""}.
          </Text>
          {/* Kit R5·4 (r-customer-b.jsx:122): the amount + rail line, accent-text and tabular. */}
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: "700",
              color: tokens.color.accentText,
              marginTop: tokens.space.md,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatMoney(amount)} · Mobile money
          </Text>
          <Text style={{ fontSize: 12, color: tokens.color.muted, textAlign: "center", marginTop: tokens.space.lg, maxWidth: 290, lineHeight: 17 }}>
            Prompts can take a few minutes — there&apos;s no deadline on our side. The kitchen starts only after the money lands and
            a rider is secured.
          </Text>
        </View>
        {onSimulateDecline ? (
          <Button label="Preview: what a declined payment looks like" variant="ghost" onPress={onSimulateDecline} />
        ) : null}
      </ScrollView>
      <Button label="I paid another way · enter my reference" variant="ghost" onPress={onEnterReference} />
    </Screen>
  );
}
