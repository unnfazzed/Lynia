import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import type { HandshakeState } from "../../logic/food-doorstep";
import { formatMoney } from "../../logic/money";
import { Button, Card, Icon } from "../index";
import { CountdownRing, formatCountdown } from "./CountdownRing";

/**
 * D5/R-04/R-05: the CASH doorstep dual-confirm handshake, RIDER half — the mirror of
 * src/ui/food/CashHandshakeCard.tsx's customer half, driven by the same {@link HandshakeState} (never
 * a fork of that state machine, only the copy/actions differ per viewer). `not_cash` never reaches
 * this component (the caller only mounts it for a CASH order); `confirmed` hands off to the delivery
 * code entry, so this renders nothing there either.
 */
export function RiderCashHandshakeCard({
  state,
  amount,
  confirmedAt,
  nowMs,
  onConfirm,
  onDispute,
  busy,
}: {
  state: HandshakeState;
  amount: number;
  /** customerCashConfirmedAt — set once the customer has tapped "I gave". */
  confirmedAt: string | null;
  nowMs: number;
  onConfirm: () => void;
  onDispute: () => void;
  busy: boolean | "queued";
}): React.ReactElement | null {
  if (state === "pending") {
    return (
      <Card>
        <Text style={{ fontWeight: "700", marginBottom: 2 }}>1 · Hand over the food first</Text>
        <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18 }}>
          Give the customer their order, then wait for them to confirm they paid you {formatMoney(amount)}.
        </Text>
      </Card>
    );
  }

  if (state === "waiting_rider" && confirmedAt) {
    return (
      <Card>
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>2 · COLLECT AND COUNT</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <Text style={{ fontSize: 30, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(amount)}</Text>
        </View>
        <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>
          The customer says they gave you this. Count it, then confirm.
        </Text>
        <Button label={`Confirm · I received ${formatMoney(amount)}`} onPress={onConfirm} loading={busy} disabled={!!busy} />
        <Button label="The amount is wrong — talk to support" variant="ghost" onPress={onDispute} disabled={!!busy} />
        {(() => {
          const total = 2 * 60 * 1000;
          const confirmedMs = new Date(confirmedAt).getTime();
          const elapsed = Number.isFinite(confirmedMs) ? Math.min(total, Math.max(0, nowMs - confirmedMs)) : 0;
          const remaining = total - elapsed;
          return (
            <View style={{ alignItems: "center", marginTop: tokens.space.sm }}>
              <CountdownRing elapsedMs={elapsed} totalMs={total} label={formatCountdown(remaining)} sub="to confirm" size={64} />
            </View>
          );
        })()}
      </Card>
    );
  }

  if (state === "frozen") {
    return (
      <Card style={{ borderColor: tokens.color.danger }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
          <Icon name="triangle-alert" size={18} color={tokens.color.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>We&apos;ve flagged this order</Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18, marginTop: 4 }}>
              The customer says they gave you {formatMoney(amount)} but this wasn&apos;t confirmed in time. Support has been
              notified automatically. You can&apos;t take a new job until this settles.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return null;
}
