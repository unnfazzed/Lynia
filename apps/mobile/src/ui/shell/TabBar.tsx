import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
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
    <View
      style={{
        flexDirection: "row",
        backgroundColor: tokens.color.bg,
        borderTopWidth: 1,
        borderTopColor: tokens.color.line,
        paddingBottom: Math.max(insets.bottom, 4),
      }}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Pressable
            key={t.id}
            onPress={() => onTab?.(t.id)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: "center", gap: 3, paddingTop: 8, paddingBottom: 6 }}
          >
            <Icon name={t.icon} size={21} color={on ? tokens.color.accentText : tokens.color.muted} />
            <Text style={{ fontSize: 11.5, fontWeight: on ? "700" : "600", color: on ? tokens.color.accentText : tokens.color.muted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
