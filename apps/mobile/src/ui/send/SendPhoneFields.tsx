import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { Recipient } from "../../logic/saved-recipients";
import { Field } from "../index";

/**
 * RF-21: the "Recipient-phone" block of app/send.tsx, extracted verbatim (see
 * docs/RF-21-SEND-SCREEN.md). Both contact-phone fields plus the recent-recipient quick-fill chips.
 */
export function SendPhoneFields({
  pickupPhone,
  onChangePickupPhone,
  pickupPhoneError,
  recipients,
  dropPhone,
  onChangeDropPhone,
  dropPhoneError,
}: {
  pickupPhone: string;
  onChangePickupPhone: (t: string) => void;
  pickupPhoneError: string | undefined;
  recipients: Recipient[];
  dropPhone: string;
  onChangeDropPhone: (t: string) => void;
  dropPhoneError: string | undefined;
}): React.ReactElement {
  return (
    <>
      {/* Contract-required (both waypoints, min 6) — they live on the required path, not in the
          "optional" collapse, so Broadcast never enables only to fail Zod on submit. */}
      <Field label="Pickup contact phone" value={pickupPhone} onChangeText={onChangePickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} error={pickupPhoneError} />
      {/* Recent-recipient quick-fill: one tap drops a past drop-off number into the field instead of
          re-typing. Only shown before the customer starts typing one, so it never fights their input. */}
      {recipients.length > 0 && dropPhone.trim().length === 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, marginBottom: tokens.space.sm }}>
          {recipients.map((r) => (
            <Pressable
              key={r.phone}
              onPress={() => onChangeDropPhone(r.phone)}
              accessibilityRole="button"
              accessibilityLabel={`Use recipient ${r.name || r.phone}`}
              style={({ pressed }) => ({
                minHeight: tokens.touchTargetMin,
                justifyContent: "center",
                paddingHorizontal: tokens.space.md,
                borderRadius: tokens.radius.pill,
                borderWidth: 1,
                borderColor: tokens.color.line,
                backgroundColor: pressed ? tokens.color.accentWash : tokens.color.surface,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
                {r.name ? `${r.name} · ${r.phone}` : r.phone}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="Recipient phone" value={dropPhone} onChangeText={onChangeDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} error={dropPhoneError} />
    </>
  );
}
