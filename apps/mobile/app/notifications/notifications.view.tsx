// GENERATED — do not edit by hand. Structural-parity source of truth for LJ.notifications.
// Source mock: packages/design/explorations/journey/screens.jsx :: Notifications
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.notifications
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/notifications/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { tokens } from "@lynia/shared";
import { AppBar, Icon, EmptyState, type IconName } from "../../src/ui";

/** A feed row, shaped to mirror the mock's `{ icon, t, m, w, unread }` keys verbatim, plus the
 *  `id` the FlatList keys by (B-O1). The container maps its live `NotificationRow` onto this,
 *  pre-formatting the relative-time label `w` (the mock's frozen 'now'/'2 min'/'1 hr'). */
export type NotificationItem = {
  id: string;
  icon: IconName;
  t: string;
  m: string;
  w: string;
  unread?: boolean;
};
export type NotificationsViewProps = {
  items: NotificationItem[];
  /** True → the mock's empty branch; false → the mapped feed. Driven by the container's feed. */
  empty: boolean;
  onBack: () => void;
  /** Open the row's order/destination — the container resolves the index to its live feed row. */
  onItemPress: (index: number) => void;
};

export function NotificationsView({
  items,
  empty,
  onBack,
  onItemPress
}: NotificationsViewProps): React.ReactElement {
  return <View>
      <View style={{
      padding: tokens.space.screen,
      minHeight: 0,
      paddingBottom: 0
    }}><AppBar title="Notifications" onBack={onBack} /></View>
      {empty ? <View style={{
      padding: tokens.space.screen,
      minHeight: "100%"
    }}><EmptyState icon="inbox" title="No notifications yet" message="Offers, delivery updates and account news will show up here." /></View> : <View style={{
      paddingTop: 0,
      paddingRight: tokens.space.screen,
      paddingBottom: tokens.space.screen,
      paddingLeft: tokens.space.screen
    }}>
          {<FlatList data={items} keyExtractor={n => n.id} showsVerticalScrollIndicator={false} renderItem={({
        item: n,
        index: i
      }) => <Pressable onPress={() => onItemPress(i)} accessibilityRole="button"><View style={{
          gap: 11,
          paddingTop: 12,
          paddingRight: 0,
          paddingBottom: 12,
          paddingLeft: 0,
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.line,
          flexDirection: "row"
        }}>
              <View style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: tokens.color.accentWash,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
                <Icon name={n.icon} size={18} color={tokens.color.accentText} />
              </View>
              <View style={{
            flex: 1,
            minWidth: 0
          }}>
                <Text style={{
              fontSize: 14,
              fontWeight: "600",
              color: tokens.color.ink
            }}>{n.t}</Text>
                <Text style={{
              fontSize: 12.5,
              color: tokens.color.muted,
              lineHeight: 18
            }}>{n.m}</Text>
                <Text style={{
              fontSize: 11,
              color: tokens.color.muted,
              marginTop: 2
            }}>{n.w}</Text>
              </View>
              {n.unread ? <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: tokens.color.accent,
            flexShrink: 0,
            marginTop: 6
          }} /> : null}
            </View></Pressable>} ListFooterComponent={<View style={{
        height: tokens.space.xxl
      }} />} />}
        </View>}
    </View>;
}
