import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { addServiceInterest, isInterested, removeServiceInterest } from "../../logic/service-interest";
import { Icon } from "../Icon";
import { PharmacySticker } from "./ServiceStickers";

/**
 * The notify-me sheet behind a SOON service tile (home 8c §2: *"tap opens the notify-me sheet —
 * never dead"*).
 *
 * A toggle, not a fire-and-forget button — the same reasoning as `RemindWhenOpen` on a closed
 * kitchen: the second most likely thing a customer does after asking is change their mind, and a
 * control that can't be undone teaches people not to press it. Asking also asks for notification
 * permission (see `logic/service-interest.ts`), because that is the part that has to be true before
 * a launch notification can ever arrive.
 *
 * NOT DRAWN by the 8c export, which specifies the sheet without designing it — logged in
 * `docs/DESIGN-DEVIATIONS.md` (D-28). It is therefore deliberately plain and built entirely from the
 * app's existing sheet grammar (`DisclaimerSheet`'s modal + handle + heading), so there is nothing
 * here for a future mock to have to undo.
 */
export function ServiceSoonSheet({
  visible,
  serviceId,
  title,
  body,
  onClose,
}: {
  visible: boolean;
  /** Stored interest key — "pharm" for the Pharmacy tile. */
  serviceId: string;
  title: string;
  body: string;
  onClose: () => void;
}): React.ReactElement {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Read the stored state each time the sheet opens, so it opens showing the truth rather than
  // whatever the last session left in component state.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setBusy(true);
    void isInterested(serviceId)
      .then((v) => {
        if (alive) setArmed(v);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, serviceId]);

  const toggle = (): void => {
    if (busy) return;
    setBusy(true);
    const next = !armed;
    void (next ? addServiceInterest(serviceId) : removeServiceInterest(serviceId))
      .then((ok) => {
        if (ok) setArmed(next);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}>
        {/* Swallow taps inside the panel so only the scrim closes it. */}
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: tokens.space.lg,
            paddingTop: tokens.space.md,
            paddingBottom: tokens.space.xl,
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.lg }} />
          <View style={{ alignItems: "center", gap: tokens.space.sm }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.tilePharmacyWash, alignItems: "center", justifyContent: "center" }}
            >
              <PharmacySticker width={58} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.sm }}>{title}</Text>
            <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", lineHeight: 20 }}>{body}</Text>
          </View>
          <Pressable
            onPress={toggle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: armed, busy }}
            accessibilityLabel={armed ? `Stop notifying me when ${title} launches` : `Notify me when ${title} launches`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: tokens.space.sm,
              marginTop: tokens.space.lg,
              minHeight: tokens.touchTargetPrimary,
              borderRadius: tokens.radius.button,
              borderWidth: armed ? 1 : 0,
              borderColor: tokens.color.accent,
              backgroundColor: armed ? tokens.color.accentWash : tokens.color.cta,
              opacity: pressed || busy ? 0.75 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator size="small" color={armed ? tokens.color.accentText : tokens.color.onAccent} />
            ) : (
              <Icon name={armed ? "check" : "bell"} size={17} color={armed ? tokens.color.accentText : tokens.color.onAccent} />
            )}
            <Text style={{ fontSize: 15, fontWeight: "700", color: armed ? tokens.color.accentText : tokens.color.onAccent }}>
              {armed ? "We'll let you know" : "Notify me"}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
