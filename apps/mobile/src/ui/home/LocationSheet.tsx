import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import type { HomePlace } from "../../logic/home-location";
import { loadSaved, type SavedPlaces } from "../../logic/saved-places";
import { AddressSearch } from "../AddressSearch";
import { Icon, type IconName } from "../Icon";
import { H } from "./copy";

/**
 * The home's address/location sheet — what the header's address control opens (Calm Mint v2 H5).
 *
 * The row shows the DETECTED current location, so this sheet's job is the two things a detected
 * value needs: re-detect it, or override it. Three ways in, in the order a customer reaches for
 * them: "Use my current location" (the default source), the saved Home/Work slots they already
 * keep for the send composer, then a free search for anywhere else.
 *
 * DRAWN by the Calm Mint v2 handoff (`packages/design/handoff/calm-mint-v2-2026-10`, H5; ledger
 * D-55, which retires D-28's undrawn-sheet half): radius-24 sheet over a 45% scrim, a 36×4 grab
 * handle, "Deliver to", the search, "Use my current location", saved Home and Work, "Add a place".
 * Rows are ≥ 56 tall. "Add a place" focuses the search — saving a found place as Home/Work is the
 * search's own job (`AddressSearch`).
 *
 * Presentational: it takes places in and hands places back. The GPS work and the persistence live
 * in `logic/home-location.ts`, per the `mobile-ui-no-api` boundary.
 */
/** Row dividers and the grab handle are drawn as literals in the handoff (`mint2.js` .srow / .grab). */
const ROW_DIVIDER = "#F0F2F4";
const GRAB = "#D5DBE0";

const SLOT_META: Record<"home" | "work", { icon: IconName; label: string }> = {
  home: { icon: "store", label: H.home },
  work: { icon: "package", label: H.work },
};

function Row({
  icon,
  iconTone = "plain",
  title,
  sub,
  selected,
  onPress,
  last,
}: {
  icon: IconName;
  iconTone?: "mint" | "plain";
  title: string;
  sub?: string;
  selected?: boolean;
  onPress: () => void;
  last?: boolean;
}): React.ReactElement {
  const mint = iconTone === "mint";
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={sub ? `${title} — ${sub}` : title}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: ROW_DIVIDER }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mint ? tokens.color.accentWash : tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color={mint ? tokens.color.accentText : tokens.color.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: mint ? tokens.color.accentText : tokens.color.ink }}>{title}</Text>
        {sub ? (
          <Text numberOfLines={1} style={{ fontSize: 12.5, color: tokens.color.muted }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={18} color={tokens.color.accent} /> : null}
    </Tappable>
  );
}

export function LocationSheet({
  visible,
  denied,
  currentLabel,
  focusSearch = false,
  onClose,
  onUseCurrentLocation,
  onPick,
}: {
  visible: boolean;
  /** Location permission is refused — say so, and lean on the saved/search paths instead. */
  denied: boolean;
  /** The address the header shows now — its saved slot, if any, carries the check. */
  currentLabel?: string;
  /** Open with the search focused (H6 "Type an address"). */
  focusSearch?: boolean;
  onClose: () => void;
  /**
   * "Use my current location": the sheet closes and the screen runs the First Run v2 location ask
   * (`useLocationAskSheet` — PC1 explains before the Android dialog, or the fix and PC7 toast when it is
   * already granted; ledger D-82).
   */
  onUseCurrentLocation: () => void;
  onPick: (place: HomePlace) => void;
}): React.ReactElement {
  const [saved, setSaved] = useState<SavedPlaces>({ home: null, work: null });
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    if (focusSearch) setFocus((n) => n + 1);
    void loadSaved().then((s) => {
      if (alive) setSaved(s);
    });
    return () => {
      alive = false;
    };
  }, [visible, focusSearch]);

  const detect = (): void => {
    onClose();
    onUseCurrentLocation();
  };

  const slots = (["home", "work"] as const).filter((slot) => saved[slot] != null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,24,27,0.45)" }}
        />
        <View
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
            maxHeight: "88%",
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: GRAB, alignSelf: "center", marginBottom: 12 }} />
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 12 }}>
            {H.deliverTo}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <AddressSearch
              label={H.deliverTo}
              placeholder={H.sheetSearch}
              focusSignal={focus}
              variant="sheet"
              onResolved={(place) => {
                onPick({ label: place.landmark, lat: place.lat, lng: place.lng });
                onClose();
              }}
            />

            {/* Honest, and actionable: the paths below still work with location switched off. */}
            {denied ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18, marginTop: 8 }}>
                Location is off for LyniaGo, so we can&apos;t detect where you are. Turn it on in Settings, or pick an address below.
              </Text>
            ) : null}

            <View style={{ marginTop: 8 }}>
              <Row icon="navigation" iconTone="mint" title={H.useCurrent} sub={H.useCurrentSub} onPress={detect} />
              {slots.map((slot) => {
                const place = saved[slot]!;
                const meta = SLOT_META[slot];
                return (
                  <Row
                    key={slot}
                    icon={meta.icon}
                    title={meta.label}
                    sub={place.landmark}
                    selected={!!currentLabel && currentLabel === place.landmark}
                    onPress={() => {
                      onPick({ label: place.landmark, lat: place.lat, lng: place.lng });
                      onClose();
                    }}
                  />
                );
              })}
              <Row icon="plus" title={H.addPlace} onPress={() => setFocus((n) => n + 1)} last />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
