import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import type { HandshakeState } from "../../logic/food-doorstep";
import { formatMoney } from "../../logic/money";
import { Button, Card, Icon } from "../index";
import { CountdownRing, formatCountdown } from "./CountdownRing";

/**
 * D4/R-04/R-05: the CASH doorstep dual-confirm handshake, customer half — "food first": hand the food
 * over, THEN pay, THEN tap. Four states, one card, driven purely by {@link HandshakeState} (never a
 * fork of Express's own tracker — this sits ABOVE it, same as the D3 prep/dispatch cards sit above
 * the Stepper). `not_cash`/`confirmed` render nothing here: `confirmed` hands off to the delivery-code
 * card, `not_cash` never reaches this component (the caller only mounts it for a CASH order).
 */
export function CashHandshakeCard({
  state,
  amount,
  confirmedAt,
  nowMs,
  onConfirm,
  busy,
}: {
  state: HandshakeState;
  amount: number;
  /** customerCashConfirmedAt — set once the customer has tapped "I gave". */
  confirmedAt: string | null;
  nowMs: number;
  onConfirm: () => void;
  busy: boolean;
}): React.ReactElement | null {
  if (state === "pending") {
    return (
      <Card>
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>TAKE YOUR FOOD, THEN PAY</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <Text style={{ fontSize: 30, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(amount)}</Text>
          <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>cash to your rider</Text>
        </View>
        <Button label={`I gave the rider ${formatMoney(amount)}`} onPress={onConfirm} loading={busy} disabled={busy} />
      </Card>
    );
  }

  if (state === "waiting_rider" && confirmedAt) {
    const total = 2 * 60 * 1000;
    const confirmedMs = new Date(confirmedAt).getTime();
    const elapsed = Number.isFinite(confirmedMs) ? Math.min(total, Math.max(0, nowMs - confirmedMs)) : 0;
    const remaining = total - elapsed;
    return (
      <Card>
        <View style={{ alignItems: "center", paddingVertical: tokens.space.sm }}>
          <CountdownRing elapsedMs={elapsed} totalMs={total} label={formatCountdown(remaining)} sub="for your rider" />
          <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.sm, textAlign: "center" }}>
            Waiting for your rider to confirm
          </Text>
          <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", marginTop: 4, maxWidth: 280, lineHeight: 18 }}>
            You said you gave {formatMoney(amount)} — that&apos;s saved. If they don&apos;t confirm within 2 minutes, support is called
            automatically.
          </Text>
        </View>
      </Card>
    );
  }

  if (state === "frozen") {
    return (
      <Card style={{ borderColor: tokens.color.danger }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
          <Icon name="circle-alert" size={18} color={tokens.color.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>We&apos;ve flagged this order</Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18, marginTop: 4 }}>
              Your rider hasn&apos;t confirmed the {formatMoney(amount)} cash exchange. Support has been notified automatically and is
              looking into it — keep your food and stay reachable.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return null;
}
