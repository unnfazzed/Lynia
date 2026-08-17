import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Linking, Text } from "react-native";
import { DELIVERY_OTP_MAX_ATTEMPTS } from "../../logic/rider-job";
import { Button, Card, CodeInput, Sub } from "../index";

// The en_route_dropoff hand-off card: the rider keys the recipient's 6-digit delivery code
// (extracted verbatim from app/rider/job.tsx).
export function DeliveryOtp({
  code,
  onChangeCode,
  otpTries,
  pending,
  onConfirm,
  senderPhone,
}: {
  code: string;
  onChangeCode: (code: string) => void;
  otpTries: number;
  pending: boolean | "queued";
  onConfirm: () => void;
  // 4·b1: the assigned rider's line to the customer (reveal window). When the code won't match, the
  // rider can call the sender to have them re-issue it — the mockup's "ask the customer to re-send"
  // action, not just static copy.
  senderPhone?: string | null;
}): React.ReactElement {
  const otpLocked = otpTries >= DELIVERY_OTP_MAX_ATTEMPTS;
  const attemptsLeft = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - otpTries);
  return (
    <Card>
      <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm hand-off</Text>
      <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
      {/* Kit `job_handoff` — six digit boxes, not a single field. */}
      <CodeInput length={6} value={code} onChangeText={onChangeCode} accessibilityLabel="Delivery code" error={otpTries > 0} disabled={otpLocked} />
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
      {/* 4·b1: the re-send action. Surfaced once a code has missed (and always in the locked state) so
          the rider has a one-tap way to reach the customer instead of being told to "ask" with no means. */}
      {otpTries > 0 && senderPhone ? (
        <Button
          label="Call sender to re-send code"
          variant="ghost"
          onPress={() => void Linking.openURL(`tel:${senderPhone}`)}
        />
      ) : null}
    </Card>
  );
}
