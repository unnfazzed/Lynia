import { type UndeliveredReason, tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { UNDELIVERED_OPTIONS } from "../../logic/rider-job";
import { Button, Card, Icon, Sub } from "../index";

// R1: the post-pickup "can't complete delivery" reason picker — commits the terminal `undelivered`
// state and frees the rider for the next job (extracted verbatim from app/rider/job.tsx).
//
// Two-step: picking a reason row doesn't fire the mutation immediately — it opens a confirm step
// first. Post-pickup (parcel already in hand) this is a more consequential, less reversible action
// than the pre-pickup cancel (BailSheet), which already gets an explicit confirm; a bare one-tap row
// here had LESS friction than the recoverable flow, not more.
export function UndeliveredSheet({
  pending,
  onSelect,
  onDismiss,
}: {
  pending: boolean;
  onSelect: (reason: UndeliveredReason) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const [picked, setPicked] = useState<UndeliveredReason | null>(null);
  const pickedOption = UNDELIVERED_OPTIONS.find((o) => o.reason === picked);

  if (pickedOption) {
    return (
      <Card style={{ borderColor: tokens.color.line }}>
        <Text style={{ fontWeight: "700", marginBottom: 2 }}>End this job?</Text>
        <Sub>
          You picked &ldquo;{pickedOption.label}&rdquo; — this ends the job and frees you for the next one. The
          parcel stays with you; the customer is told the hand-off couldn&apos;t be completed.
        </Sub>
        <Button label="Confirm — end the job" onPress={() => onSelect(pickedOption.reason)} loading={pending} />
        <Button label="Choose a different reason" variant="ghost" onPress={() => setPicked(null)} disabled={pending} />
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: tokens.color.line }}>
      <Text style={{ fontWeight: "700", marginBottom: 2 }}>Can&apos;t complete this delivery?</Text>
      <Sub>Pick the reason — this ends the job, so only use it if the hand-off truly can&apos;t happen.</Sub>
      <View style={{ gap: tokens.space.sm, marginTop: tokens.space.sm }}>
        {UNDELIVERED_OPTIONS.map((o) => (
          <Pressable
            key={o.reason}
            onPress={() => setPicked(o.reason)}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.md,
              minHeight: tokens.touchTargetMin,
              paddingHorizontal: tokens.space.md,
              paddingVertical: tokens.space.sm,
              borderRadius: tokens.radius.input,
              borderWidth: 1,
              borderColor: tokens.color.line,
              backgroundColor: tokens.color.surface,
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Icon name={o.icon} size={16} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.ink }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Never mind" variant="ghost" onPress={onDismiss} disabled={pending} />
    </Card>
  );
}
