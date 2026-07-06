import { type UndeliveredReason, tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { UNDELIVERED_OPTIONS } from "../../logic/rider-job";
import { Button, Card, Icon, Sub } from "../index";

// R1: the post-pickup "can't complete delivery" reason picker — commits the terminal `undelivered`
// state and frees the rider for the next job (extracted verbatim from app/rider/job.tsx).
export function UndeliveredSheet({
  pending,
  onSelect,
  onDismiss,
}: {
  pending: boolean;
  onSelect: (reason: UndeliveredReason) => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <Card style={{ borderColor: tokens.color.line }}>
      <Text style={{ fontWeight: "700", marginBottom: 2 }}>Can&apos;t complete this delivery?</Text>
      <Sub>Pick the reason — this ends the job, so only use it if the hand-off truly can&apos;t happen.</Sub>
      <View style={{ gap: tokens.space.sm, marginTop: tokens.space.sm }}>
        {UNDELIVERED_OPTIONS.map((o) => (
          <Pressable
            key={o.reason}
            onPress={() => onSelect(o.reason)}
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
