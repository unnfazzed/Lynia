import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { addServiceInterest, isInterested, removeServiceInterest } from "../../logic/service-interest";
import { PharmacyStickerV2, RestaurantsSticker, ShopsSticker } from "../art/stickers";
import { Icon } from "../Icon";
import { H } from "./copy";

/**
 * The notify-me sheet a not-yet-live service tile opens — drawn by the Calm Mint v2 handoff for
 * Shops (`mint2.js` `H.notify`; ledger D-55): a 96px rounded sticker plate, "Shops are coming soon",
 * the body, "Notify me" and "Not now". Pharmacy and a kill-switched Restaurants reuse the same
 * drawing with their own noun (D-55).
 *
 * "Notify me" is a REVERSIBLE toggle, kept from the 8c sheet: the intent is recorded on-device
 * (`logic/service-interest.ts`) because no launch-list backend exists yet (the handoff marks it
 * NEEDS BACKEND · notify-me list).
 */
export type SoonService = "shops" | "pharmacy" | "food";

const PLATE: Record<SoonService, { bg: string; Art: (p: { width: number }) => React.ReactElement; interestId: string }> = {
  shops: { bg: tokens.color.riderWash, Art: ShopsSticker, interestId: "shops" },
  pharmacy: { bg: tokens.color.tilePharmacyWash, Art: PharmacyStickerV2, interestId: "pharm" },
  food: { bg: tokens.color.tileFood, Art: RestaurantsSticker, interestId: "food" },
};

const GRAB = "#D5DBE0";

export function ServiceSoonSheet({
  visible,
  service,
  onClose,
}: {
  visible: boolean;
  service: SoonService;
  onClose: () => void;
}): React.ReactElement {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { bg, Art, interestId } = PLATE[service];
  const copy = H.soon[service];

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setBusy(true);
    void isInterested(interestId)
      .then((v) => {
        if (alive) setArmed(v);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, interestId]);

  const toggle = (): void => {
    if (busy) return;
    setBusy(true);
    const next = !armed;
    void (next ? addServiceInterest(interestId) : removeServiceInterest(interestId))
      .then((ok) => {
        if (ok) setArmed(next);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,24,27,0.45)" }}
        />
        <View style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, alignItems: "stretch" }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: GRAB, alignSelf: "center", marginBottom: 12 }} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ alignSelf: "center", width: 96, height: 96, marginTop: 8, borderRadius: 28, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
          >
            <Art width={64} />
          </View>
          <Text accessibilityRole="header" style={{ marginTop: 16, textAlign: "center", fontSize: 22, letterSpacing: -0.3, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {copy.title}
          </Text>
          <Text style={{ marginTop: 8, marginBottom: 20, textAlign: "center", fontSize: 14.5, lineHeight: 21, color: tokens.color.muted }}>{copy.body}</Text>
          <Tappable
            onPress={toggle}
            disabled={busy}
            tone={armed ? "row" : "onDark"}
            accessibilityRole="button"
            accessibilityState={{ selected: armed, busy }}
            accessibilityLabel={armed ? `${H.notifyArmed}. Tap to stop` : H.notifyMe}
            style={{
              height: tokens.touchTargetPrimary,
              borderRadius: tokens.radius.button,
              borderWidth: armed ? 1 : 0,
              borderColor: tokens.color.accent,
              backgroundColor: armed ? tokens.color.accentWash : tokens.color.cta,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={armed ? tokens.color.accentText : tokens.color.onAccent} />
            ) : armed ? (
              <Icon name="check" size={18} color={tokens.color.accentText} />
            ) : null}
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: armed ? tokens.color.accentText : tokens.color.onAccent }}>
              {armed ? H.notifyArmed : H.notifyMe}
            </Text>
          </Tappable>
          <Tappable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={H.notNow}
            style={{ marginTop: 8, height: 48, borderRadius: tokens.radius.button, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{H.notNow}</Text>
          </Tappable>
        </View>
      </View>
    </Modal>
  );
}
