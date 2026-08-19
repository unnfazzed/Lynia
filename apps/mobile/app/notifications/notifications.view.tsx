// GENERATED — do not edit by hand, EXCEPT the interaction seam marked STREAMLINE-01 below.
// Structural-parity source of truth for LJ.notifications.
// Source mock: packages/design/explorations/journey/screens.jsx :: Notifications
// Regenerate:  node tools/parity/codegen/cli.mjs gen LJ.notifications
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/notifications/index.tsx) — that is the ONLY hand-wired seam.
//
// STREAMLINE-01 (owner-approved deviation, docs/DESIGN-DEVIATIONS.md D-27): swipe-to-dismiss is an
// INTERACTION the static mock could not draw, added here as handler props + a transform on the EXISTING
// nodes — no element is added, removed or re-kinded, so the structural snapshot stays green by
// construction and a regeneration of this file diffs only in these marked additions. Read that entry
// before touching this: the rule it bends ("not drawn ⇒ not rendered") is otherwise absolute.
import React from "react";
import { View, Text, FlatList, PanResponder } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Tappable, AppBar, Icon, EmptyState, type IconName } from "../../src/ui";

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
  /** STREAMLINE-01: swipe the row away — the container owns the optimistic removal + the API call. */
  onItemDismiss: (index: number) => void;
};

/**
 * STREAMLINE-01: how far a horizontal drag must travel before the row is treated as dismissed, and how
 * far a drag must travel before the gesture is claimed from the FlatList at all. The claim threshold is
 * small (so the gesture feels responsive) but requires the drag to be more horizontal than vertical, so
 * scrolling the list never starts a dismissal.
 */
const DISMISS_DISTANCE = 96;
const CLAIM_DISTANCE = 10;

export function NotificationsView({
  items,
  empty,
  onBack,
  onItemPress,
  onItemDismiss
}: NotificationsViewProps): React.ReactElement {
  // STREAMLINE-01 interaction seam. ONE PanResponder for the whole list rather than one per row: a
  // touch device can only drag one row at a time, and a per-row responder would need a per-row hook —
  // which `renderItem` (a plain function call, not a component) cannot host. The row being dragged is
  // captured by its own `onTouchStart` into a ref, so the shared responder knows which index it owns.
  const draggingIndex = React.useRef<number | null>(null);
  const [drag, setDrag] = React.useState<{ index: number; dx: number } | null>(null);
  const dragRef = React.useRef<{ index: number; dx: number } | null>(null);
  const setBoth = (next: { index: number; dx: number } | null): void => {
    dragRef.current = next;
    setDrag(next);
  };
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        // Vertical (or barely-moved) gestures are left to the FlatList; only a decidedly horizontal
        // drag becomes a dismissal. Claiming on MOVE rather than START also keeps plain taps working —
        // the Pressable's onPress still fires when the responder is never claimed.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > CLAIM_DISTANCE && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => {
          const index = draggingIndex.current;
          if (index !== null) setBoth({ index, dx: g.dx });
        },
        onPanResponderRelease: () => {
          const current = dragRef.current;
          setBoth(null);
          if (current && Math.abs(current.dx) >= DISMISS_DISTANCE) onItemDismiss(current.index);
        },
        // A cancelled gesture (an incoming call, a parent claiming the responder) must spring back, not
        // dismiss — otherwise a notification disappears without the user having completed the swipe.
        onPanResponderTerminate: () => setBoth(null),
      }),
    [onItemDismiss],
  );

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
      }) => <Tappable onPress={() => onItemPress(i)} accessibilityRole="button" onTouchStart={() => {
        draggingIndex.current = i;
      }} {...pan.panHandlers}><View style={{
          gap: 11,
          paddingTop: 12,
          paddingRight: 0,
          paddingBottom: 12,
          paddingLeft: 0,
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.line,
          flexDirection: "row",
          // STREAMLINE-01: the drag follows the finger on the row being swiped, and only that row. A
          // plain transform on the node the mock already draws — no wrapper element, so the structural
          // snapshot is unaffected.
          transform: [{ translateX: drag?.index === i ? drag.dx : 0 }],
          opacity: drag?.index === i ? Math.max(0.35, 1 - Math.abs(drag.dx) / (DISMISS_DISTANCE * 2)) : 1
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
            </View></Tappable>} ListFooterComponent={<View style={{
        height: tokens.space.xxl
      }} />} />}
        </View>}
    </View>;
}
