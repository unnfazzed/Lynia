import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";

export type AppTab = { id: string; icon: IconName; label: string };

/**
 * Root tab bar — the app root, NOT a product switcher (`packages/design/components/shell/
 * TabBar.jsx`). Services live on Home as tiles, so a new vertical adds a tile, never a tab. `id`
 * doubles as the `app/(tabs)/<id>.tsx` route segment name (see `app/(tabs)/_layout.tsx`), so a tab
 * press needs no id→route lookup table.
 */
export const APP_TABS: AppTab[] = [
  { id: "home", icon: "store", label: "Home" },
  { id: "orders", icon: "receipt", label: "Orders" },
  { id: "account", icon: "user", label: "Account" },
];

/**
 * Rider root tab bar (plan §5 Lane B1) — `Jobs | Money | Account`, mirroring the customer shell's
 * `APP_TABS` one tab bar down. Lives at `app/rider/(tabs)/`, nested under the existing `/rider`
 * boot segment rather than the app root, so `id: "index"` (the board) keeps every existing
 * `"/rider"` call site working with zero string changes — same trick A1 used for `"/home"`.
 */
export const RIDER_TABS: AppTab[] = [
  { id: "index", icon: "bike", label: "Jobs" },
  { id: "money", icon: "banknote", label: "Money" },
  { id: "account", icon: "user", label: "Account" },
];

export function TabBar({
  active,
  tabs = APP_TABS,
  onTab,
}: {
  active?: string;
  tabs?: AppTab[];
  onTab?: (id: string) => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Tappable
            key={t.id}
            onPress={() => onTab?.(t.id)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            style={styles.tab}
          >
            <Icon name={t.icon} size={21} color={on ? tokens.color.accentText : tokens.color.muted} />
            <Text style={on ? styles.labelOn : styles.labelOff}>{t.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/**
 * Hoisted out of render (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.2). The tab bar is on
 * screen for the whole session and re-renders with every route change, and a style object literal in
 * JSX is a NEW object each time — so React Native's shallow prop diff sees a change on every node and
 * re-sends props across the bridge even when the rendered result is identical. `StyleSheet.create`
 * returns the same frozen objects for the life of the process, so an unchanged tab now diffs to
 * nothing. The two label variants are separate entries rather than one style plus an inline override
 * for the same reason: the override literal would reintroduce the fresh object it exists to avoid.
 * Only the safe-area pad stays inline — it is genuinely dynamic.
 */
const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: tokens.color.bg,
    borderTopWidth: 1,
    borderTopColor: tokens.color.line,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingTop: 8, paddingBottom: 6 },
  labelOn: { fontSize: 11.5, fontWeight: "700", color: tokens.color.accentText },
  labelOff: { fontSize: 11.5, fontWeight: "600", color: tokens.color.muted },
});
