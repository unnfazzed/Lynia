import { tokens } from "@lynia/shared/tokens";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View, type ViewStyle } from "react-native";
import { STORE_URL } from "../../config";
import { loadSoftUpdateDismissed, saveSoftUpdateDismissed, shouldShowSoftUpdate } from "../../logic/soft-update";
import { useServerVersionGate } from "../../net/use-server-version-gate";
import { Icon } from "../Icon";
import { UP } from "./copy";

/**
 * U4b's body line on the violet banner. Drawn (`fr-states.js` U4b) but not in the token table (README
 * §5); used as drawn, text only. D-81 §4.
 */
const VIOLET_BODY = "#DCD5FF";

export type SoftUpdateTone = "forest" | "violet";

const TONE: Record<SoftUpdateTone, { bg: string; body: string; pillBg: string; pillBgPressed: string; pillInk: string; margin: ViewStyle }> = {
  // U4a (customer Home): forest, body `illusMint` (#B9E8CC), a brand-green pill with white text. Drawn
  // `margin:12px 16px 0` under the Home header.
  forest: { bg: tokens.color.forest, body: tokens.color.illusMint, pillBg: tokens.color.accent, pillBgPressed: tokens.color.accentPressed, pillInk: tokens.color.onAccent, margin: { marginTop: 12, marginHorizontal: tokens.space.screen } },
  // U4b (rider board): violet, a white pill with violet text. Drawn inside the board body's padding.
  violet: { bg: tokens.color.riderAccent, body: VIOLET_BODY, pillBg: tokens.color.bg, pillBgPressed: tokens.color.riderWash, pillInk: tokens.color.riderAccent, margin: {} },
};

export interface SoftUpdateState {
  visible: boolean;
  /** The recommended version the banner is about (null when hidden). */
  version: string | null;
  /** Opens the store listing and settles this version on this phone. */
  onUpdate: () => void;
  /** ✕: settles this version on this phone. */
  onDismiss: () => void;
}

/**
 * The soft update (U4a/U4b, ledger D-81 §2 #7): visible when the server's `recommendedVersion` (fetched
 * once per cold start by the root layout) is above this build and this version hasn't been settled on
 * this phone yet. Hidden while the dismissed version is still being read, so it never flashes.
 */
export function useSoftUpdate(current: string = Constants.expoConfig?.version ?? "0.0.0"): SoftUpdateState {
  const gate = useServerVersionGate();
  const recommended = gate?.recommended ?? null;
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadSoftUpdateDismissed().then((v) => alive && setDismissed(v));
    return () => {
      alive = false;
    };
  }, []);
  const visible = dismissed !== undefined && shouldShowSoftUpdate({ current, recommended, dismissed, hasStoreLink: !!STORE_URL });
  const settle = useCallback(() => {
    if (!recommended) return;
    setDismissed(recommended);
    void saveSoftUpdateDismissed(recommended);
  }, [recommended]);
  const onUpdate = useCallback(() => {
    settle();
    if (STORE_URL) void Linking.openURL(STORE_URL).catch(() => undefined);
  }, [settle]);
  return { visible, version: visible ? recommended : null, onUpdate, onDismiss: settle };
}

/**
 * U4a (`tone="forest"`, customer Home, under the header) and U4b (`tone="violet"`, rider board): radius
 * 20, padding 14 14 14 16, 12 gap; title 15/700 white, body 13; an "Update" soft pill (44, padding 0 18,
 * 600 14) and a 44 ✕. Renders nothing unless {@link useSoftUpdate} says so; `state` lets a caller that
 * already holds the hook (or a test) drive it.
 */
export function SoftUpdateBanner({ tone = "forest", state, style }: { tone?: SoftUpdateTone; state?: SoftUpdateState; style?: ViewStyle }): React.ReactElement | null {
  const own = useSoftUpdate();
  const s = state ?? own;
  if (!s.visible) return null;
  const t = TONE[tone];
  return (
    <View
      testID="soft-update-banner"
      accessibilityRole="summary"
      style={[{ borderRadius: 20, backgroundColor: t.bg, paddingVertical: 14, paddingLeft: 16, paddingRight: 14, flexDirection: "row", alignItems: "center", gap: 12 }, t.margin, style]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{UP.softTitle}</Text>
        <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: t.body }}>{UP.softBody}</Text>
      </View>
      <Pressable
        testID="soft-update-cta"
        onPress={s.onUpdate}
        accessibilityRole="button"
        accessibilityLabel={UP.softCta}
        style={({ pressed }) => ({ minHeight: tokens.touchTargetMin, paddingHorizontal: 18, borderRadius: tokens.radius.pill, backgroundColor: pressed ? t.pillBgPressed : t.pillBg, alignItems: "center", justifyContent: "center" })}
      >
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: t.pillInk }}>{UP.softCta}</Text>
      </Pressable>
      <Pressable
        testID="soft-update-dismiss"
        onPress={s.onDismiss}
        accessibilityRole="button"
        accessibilityLabel={UP.softDismiss}
        style={({ pressed }) => ({ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
      >
        <Icon name="x" size={20} color={t.body} />
      </Pressable>
    </View>
  );
}
