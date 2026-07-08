import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Button, Card, Field, Icon, Sub } from "../index";

// 4·b3: the pre-pickup "cancel this job" flow. The bare one-tap ghost button penalised the rider
// (server strike + cooldown) with no warning; the mockup (JobBail) designs a reason field, a
// reliability-score caution, and an explicit confirm. Reason is optional (CancelRequest.reason,
// ≤280) and forwarded to cancelOrder so the customer's re-broadcast carries a "why".
export function BailSheet({
  reason,
  onChangeReason,
  pending,
  onConfirm,
  onDismiss,
}: {
  reason: string;
  onChangeReason: (t: string) => void;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <>
      <Card style={{ borderColor: tokens.color.line }}>
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Cancel this job?</Text>
        <Sub>
          The customer&apos;s order goes out to other riders again at the same price so another rider can take it. You
          can only cancel before pickup — once the parcel&apos;s on your bike, finish the job or mark it
          undeliverable.
        </Sub>
        <Field
          label="Reason (optional)"
          value={reason}
          onChangeText={onChangeReason}
          placeholder="e.g. bike trouble"
          maxLength={280}
        />
        <Button label="Confirm cancellation" onPress={onConfirm} loading={pending} />
        <Button label="Keep job" variant="ghost" onPress={onDismiss} disabled={pending} />
      </Card>
      {/* Reliability-score caution — a muted highlight wash, never an alarm. The strike + cooldown are
          real server-side, so the rider must be warned before, not penalised silently after. */}
      <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: tokens.color.highlightBorder }}>
        <View style={{ flexDirection: "row", gap: tokens.space.sm, alignItems: "flex-start" }}>
          <Icon name="triangle-alert" size={16} color={tokens.color.highlight} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.ink, lineHeight: 18 }}>
            Cancelling an accepted job affects your reliability score. Too many cancels can pause your
            account.
          </Text>
        </View>
      </Card>
    </>
  );
}
