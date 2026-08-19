import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { HomePlace } from "../../logic/home-location";
import { loadSaved, type SavedPlaces } from "../../logic/saved-places";
import { AddressSearch } from "../AddressSearch";
import { Icon, type IconName } from "../Icon";

/**
 * The home's address/location sheet — what the 8c header's address row opens.
 *
 * The row shows the DETECTED current location, so this sheet's job is the two things a detected
 * value needs: re-detect it, or override it. Three ways in, in the order a customer reaches for
 * them: "Use my current location" (the default source), the saved Home/Work slots they already
 * keep for the send composer, then a free search for anywhere else.
 *
 * NOT DRAWN by the 8c export, which specifies the sheet ("Tap → address/location sheet") without
 * designing it — logged in `docs/DESIGN-DEVIATIONS.md` (D-28). So it is built entirely from parts
 * that already exist (`DisclaimerSheet`'s modal grammar, the composer's `AddressSearch`), with
 * nothing invented that a future mock would have to undo.
 *
 * Presentational: it takes places in and hands places back. The GPS work and the persistence live
 * in `logic/home-location.ts`, per the `mobile-ui-no-api` boundary.
 */
const SLOT_META: Record<"home" | "work", { icon: IconName; label: string }> = {
  home: { icon: "map-pin", label: "Home" },
  work: { icon: "package", label: "Work" },
};

export function LocationSheet({
  visible,
  denied,
  onClose,
  onUseCurrentLocation,
  onPick,
}: {
  visible: boolean;
  /** Location permission is refused — say so, and lean on the saved/search paths instead. */
  denied: boolean;
  onClose: () => void;
  /** Re-detect. Resolves to the detected place, or null when it could not be resolved. */
  onUseCurrentLocation: () => Promise<HomePlace | null>;
  onPick: (place: HomePlace) => void;
}): React.ReactElement {
  const [saved, setSaved] = useState<SavedPlaces>({ home: null, work: null });
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setFailed(false);
    void loadSaved().then((s) => {
      if (alive) setSaved(s);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const detect = (): void => {
    if (locating) return;
    setLocating(true);
    setFailed(false);
    void onUseCurrentLocation()
      .then((place) => {
        if (place) onClose();
        else setFailed(true);
      })
      .finally(() => setLocating(false));
  };

  const slots = (["home", "work"] as const).filter((slot) => saved[slot] != null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Tappable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}>
        {/* Swallow taps inside the panel so only the scrim closes it. */}
        <Tappable
          onPress={() => undefined}
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: tokens.space.lg,
            paddingTop: tokens.space.md,
            paddingBottom: tokens.space.xl,
            maxHeight: "88%",
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.md }} />
          <Text style={{ fontSize: 19, fontWeight: "700", color: tokens.color.ink }}>Deliver to</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <Pressable
              onPress={detect}
              disabled={locating}
              accessibilityRole="button"
              accessibilityState={{ busy: locating }}
              accessibilityLabel="Use my current location"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.md,
                minHeight: tokens.touchTargetMin,
                paddingVertical: tokens.space.md,
                opacity: pressed || locating ? 0.7 : 1,
              })}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
                {locating ? <ActivityIndicator size="small" color={tokens.color.accentText} /> : <Icon name="navigation" size={17} color={tokens.color.accentText} />}
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>Use my current location</Text>
            </Pressable>

            {/* Honest, and actionable: the two paths below still work with location switched off. */}
            {denied ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18, marginBottom: tokens.space.sm }}>
                Location is off for LyniaGo, so we can&apos;t detect where you are. Turn it on in Settings, or pick an address below.
              </Text>
            ) : null}
            {failed && !denied ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, lineHeight: 18, marginBottom: tokens.space.sm }}>
                Couldn&apos;t get a fix just now. Try again in a moment, or pick an address below.
              </Text>
            ) : null}

            {slots.map((slot) => {
              const place = saved[slot]!;
              const meta = SLOT_META[slot];
              return (
                <Pressable
                  key={slot}
                  onPress={() => {
                    onPick({ label: place.landmark, lat: place.lat, lng: place.lng });
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${meta.label} — ${place.landmark}`}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: tokens.space.md,
                    minHeight: tokens.touchTargetMin,
                    paddingVertical: tokens.space.md,
                    borderTopWidth: 1,
                    borderTopColor: tokens.color.line,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                    <Icon name={meta.icon} size={17} color={tokens.color.accentText} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{meta.label}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: tokens.color.muted }}>
                      {place.landmark}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.line, paddingTop: tokens.space.md, marginTop: tokens.space.xs }}>
              <AddressSearch
                label="Search an address"
                placeholder="Street, suburb or landmark"
                onResolved={(place) => {
                  onPick({ label: place.landmark, lat: place.lat, lng: place.lng });
                  onClose();
                }}
              />
            </View>
          </ScrollView>
        </Tappable>
      </Tappable>
    </Modal>
  );
}
