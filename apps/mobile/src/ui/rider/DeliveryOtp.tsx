import { tokens } from "@lynia/shared";
import React from "react";
import { Text } from "react-native";
import { DELIVERY_OTP_MAX_ATTEMPTS } from "../../logic/rider-job";
import { Button, Card, Field, Sub } from "../index";

// The en_route_dropoff hand-off card: the rider keys the recipient's 6-digit delivery code
// (extracted verbatim from app/rider/job.tsx).
export function DeliveryOtp({
  code,
  onChangeCode,
  otpTries,
  pending,
  onConfirm,
}: {
  code: string;
  onChangeCode: (code: string) => void;
  otpTries: number;
  pending: boolean;
  onConfirm: () => void;
}): React.ReactElement {
  const otpLocked = otpTries >= DELIVERY_OTP_MAX_ATTEMPTS;
  const attemptsLeft = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - otpTries);
  return (
    <Card>
      <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm hand-off</Text>
      <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
      <Field label="Delivery code" value={code} onChangeText={onChangeCode} keyboardType="number-pad" maxLength={6} />
      {/* R9: show how many tries remain, and once locked stop inviting more taps into a dead endpoint. */}
      {otpLocked ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: 4, lineHeight: 18 }}>
          Too many attempts. Ask the customer to re-issue the code, then enter the new one.
        </Text>
      ) : otpTries > 0 ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: 4 }}>
          That code didn&apos;t match — {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left.
        </Text>
      ) : null}
      <Button
        label="Confirm delivery"
        onPress={onConfirm}
        loading={pending}
        disabled={otpLocked || code.trim().length !== 6}
      />
    </Card>
  );
}
