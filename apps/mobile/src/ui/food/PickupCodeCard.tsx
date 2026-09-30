import { DELIVERY_OTP_MAX_ATTEMPTS } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, CodeInput, Sub } from "../index";

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
      <PickupPaymentBanner paid={paid} paidReference={paidReference} amountDue={amountDue} />
      <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm pickup</Text>
      <Sub>Ask the kitchen for the 4-digit pickup code.</Sub>
      {/* Kit `pickup_confirm` — four digit boxes, mirroring the 6-box hand-off grid one hop later. */}
      <CodeInput length={4} value={code} onChangeText={onChangeCode} accessibilityLabel="Pickup code" error={attempts > 0} disabled={locked} />
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

/** R-12's PAID / NOT-PAID banner, shared by the code entry and the auto-accept "Collected" card. */
function PickupPaymentBanner({
  paid,
  paidReference,
  amountDue,
}: {
  paid: boolean;
  paidReference?: string | null;
  amountDue: number | null;
}): React.ReactElement | null {
  return paid ? (
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
  ) : null;
}

/**
 * Auto-accept pickup: at a restaurant that skipped the accept window the kitchen may not be in the app
 * to read out a code, so the rider taps "Collected" instead — accepted server-side only near the
 * restaurant's pin. Same card shape and PAID/NOT-PAID banner as the code entry it replaces.
 */
export function CollectedPickupCard({
  pending,
  onCollected,
  error,
  paid,
  paidReference,
  amountDue,
}: {
  pending: boolean | "queued";
  onCollected: () => void;
  /** Inline failure line (too far / no location fix / server message), null when there is none. */
  error: string | null;
  paid: boolean;
  paidReference?: string | null;
  amountDue: number | null;
}): React.ReactElement {
  return (
    <Card>
      <PickupPaymentBanner paid={paid} paidReference={paidReference} amountDue={amountDue} />
      <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Collect the food</Text>
      <Sub>Tap Collected when the kitchen hands it over. It only works at the restaurant.</Sub>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginBottom: tokens.space.sm, lineHeight: 18 }}>
          {error}
        </Text>
      ) : null}
      <Button label="Collected" onPress={onCollected} loading={pending} />
    </Card>
  );
}
