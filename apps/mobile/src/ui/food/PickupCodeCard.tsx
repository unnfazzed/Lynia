import { DELIVERY_OTP_MAX_ATTEMPTS, tokens } from "@lynia/shared";
import React from "react";
import { Text } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, Field, Sub } from "../index";

/**
 * D5/N-16: the rider's pickup-code entry at the counter — mirrors rider/DeliveryOtp's shape one hop
 * earlier (4 digits instead of 6, "the kitchen" instead of "the recipient"). Also carries R-12's PAID/
 * NOT-PAID banner, since the mockup (`pickup_confirm`/`pickup_paid`) shows both on the same screen the
 * code is entered on — not a separate card.
 */
export function PickupCodeCard({
  code,
  onChangeCode,
  attempts,
  pending,
  onConfirm,
  paid,
  paidReference,
  amountDue,
}: {
  code: string;
  onChangeCode: (code: string) => void;
  attempts: number;
  pending: boolean | "queued";
  onConfirm: () => void;
  /** R-12: WALLET orders are already paid before dispatch — show the confirmed mark, not a due amount. */
  paid: boolean;
  paidReference?: string | null;
  /** R-12 mirror: a CASH order's "NOT PAID — collect $X at the door" banner. Null for a WALLET order. */
  amountDue: number | null;
}): React.ReactElement {
  const locked = attempts >= DELIVERY_OTP_MAX_ATTEMPTS;
  const attemptsLeft = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - attempts);
  return (
    <Card>
      {paid ? (
        <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent", marginBottom: tokens.space.sm }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.accentText }}>PAID</Text>
          <Text style={{ fontSize: 12, color: tokens.color.accentText, marginTop: 2 }}>
            {paidReference ? `Confirmed by the kitchen · ref ${paidReference}` : "Confirmed by the kitchen."} Collect nothing.
          </Text>
        </Card>
      ) : amountDue != null ? (
        <Card style={{ backgroundColor: tokens.color.dangerWash, borderColor: "transparent", marginBottom: tokens.space.sm }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.dangerInk }}>
            NOT PAID — collect {formatMoney(amountDue)} at the door
          </Text>
        </Card>
      ) : null}
      <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm pickup</Text>
      <Sub>Ask the kitchen for the 4-digit pickup code.</Sub>
      <Field label="Pickup code" value={code} onChangeText={onChangeCode} keyboardType="number-pad" maxLength={4} />
      {locked ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: 4, lineHeight: 18 }}>
          Too many attempts. Ask the kitchen to re-check the code, then enter the new one.
        </Text>
      ) : attempts > 0 ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: 4 }}>
          That code didn&apos;t match — {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left.
        </Text>
      ) : null}
      <Button label="Confirm pickup" onPress={onConfirm} loading={pending} disabled={locked || code.trim().length !== 4} />
    </Card>
  );
}
