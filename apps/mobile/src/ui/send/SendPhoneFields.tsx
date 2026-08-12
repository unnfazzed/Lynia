import { formatPhoneLocal, tokens } from "@lynia/shared";
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
      {/* Kit copy (screens.jsx:190): the label says whose number this is, and the hint answers the
          "who sees my number?" question the field otherwise leaves hanging. */}
      <Field
        label="Your phone (sender)"
        value={pickupPhone}
        onChangeText={onChangePickupPhone}
        placeholder="0771234567"
        keyboardType="phone-pad"
        maxLength={20}
        error={pickupPhoneError}
        hint="Shared with your rider only during the delivery."
      />
      {/* Recent-recipient quick-fill: one tap drops a past drop-off number into the field instead of
          re-typing. Only shown before the customer starts typing one, so it never fights their input. */}
      {recipients.length > 0 && dropPhone.trim().length === 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, marginBottom: tokens.space.sm }}>
          {recipients.map((r) => (
            <Pressable
              key={r.phone}
              onPress={() => onChangeDropPhone(formatPhoneLocal(r.phone))}
              accessibilityRole="button"
              accessibilityLabel={`Use recipient ${r.name || formatPhoneLocal(r.phone)}`}
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
                {r.name ? `${r.name} · ${formatPhoneLocal(r.phone)}` : formatPhoneLocal(r.phone)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {/* Kit hint (screens.jsx:191) — says why a second number is asked for at all. */}
      <Field
        label="Recipient phone"
        value={dropPhone}
        onChangeText={onChangeDropPhone}
        placeholder="0771234567"
        keyboardType="phone-pad"
        maxLength={20}
        error={dropPhoneError}
        hint="So the rider can reach them at drop-off."
      />
    </>
  );
}
