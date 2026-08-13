import { formatPhoneLocal, tokens } from "@lynia/shared";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Icon, OfflineBanner, Screen } from "../index";

/**
 * R5·4 (r-customer-b.jsx:116) — "Check your phone": the rail prompt has gone out and we're waiting
 * for the customer to approve it on their handset.
 *
 * ⚠️ THE PAYMENT RAIL DOES NOT EXIST. There is no prompt-send endpoint in this codebase (see
 * ManualPayRail / FoodOrderAwaitingPaymentView: the shipped path is USSD + "submit my reference",
 * matched by the merchant against their own statement). This screen is reachable only through the
 * transition gated by `usePaymentSimulation()` — the QA APK plus a server kill switch.
 *
 * ⚠️ IT CARRIES NO ON-SCREEN MARKER. It used to paint a red SIMULATED/PREVIEW notice above its hero;
 * the owner removed every such label on 2026-08-12, explicitly accepting the risk, so this now reads
 * to a customer as an ordinary payment-wait screen while no prompt has been sent. **The server flag is
 * therefore the ONLY control left over this screen** — there is no longer anything in the UI telling a
 * customer it isn't real. Treat `PAYMENT_SIMULATION_ENABLED` as load-bearing, not as a nicety.
 *
 * It remains a WAIT state and nothing more: it never asserts that money moved, and there is still no
 * simulated success anywhere on this lane — the only way an order becomes "paid" is a real reference
 * from a real transfer.
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
          <Button label="Payment declined" variant="ghost" onPress={onSimulateDecline} />
        ) : null}
      </ScrollView>
      <Button label="I paid another way · enter my reference" variant="ghost" onPress={onEnterReference} />
    </Screen>
  );
}
