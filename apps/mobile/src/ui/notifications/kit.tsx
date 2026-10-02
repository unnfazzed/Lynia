import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Animated, PanResponder, Text, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { PharmacyStickerV2, RestaurantsSticker, SendStickerV2, ShopsSticker } from "../art/stickers";
import { TrustTrackingArt } from "../art/TrustTrackingArt";
import { SKELETON } from "../browse/kit";
import { CtaButton, IconDisc, SmBtn } from "../order/kit";
import { earlier, N } from "./copy";
import type { NItem, Service, Tone } from "./model";

/**
 * Notifications v1 parts (`packages/design/handoff/notifications-v1/n-kit.jsx`, ledger D-66): `NDisc`,
 * `NCard`, `Day`, `Beads`, `Timeline`, `NRow`, `SwipeRow`, `OffRow`, `OtherSide`, `SkelRow`, plus the N8
 * empty card and the N10 couldn't-load body. Every measurement is the handoff's.
 */

const C = tokens.color;
const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Tone = the icon disc (README "Tones"). Gold is never a tone — it is the unread dot only. */
const TONE: Record<Tone | "other", { bg: string; fg: string; border?: [number, string] }> = {
  neutral: { bg: C.accentWash, fg: C.accentText },
  good: { bg: C.cta, fg: C.onAccent },
  money: { bg: C.tileSun, fg: C.sunInk },
  warn: { bg: C.bg, fg: C.danger, border: [1.5, C.danger] },
  danger: { bg: C.dangerWash, fg: C.dangerInk },
  other: { bg: C.surface, fg: C.muted, border: [1, C.line] },
};

/** Order rows: the v2 service sticker on its tile tint (Order flow v2.1's venue disc). */
const KIND: Record<Service, { tint: string; Art: (p: { width: number }) => React.ReactElement }> = {
  send: { tint: C.tileMint, Art: SendStickerV2 },
  restaurants: { tint: C.tilePeach, Art: RestaurantsSticker },
  shops: { tint: C.tileLilac, Art: ShopsSticker },
  pharmacy: { tint: C.tilePharmacy, Art: PharmacyStickerV2 },
};

/** The tone's 18px corner mark on an order disc. An order in progress (neutral) has none. */
const MARK: Partial<Record<Tone, { bg: string; bang: boolean }>> = {
  good: { bg: C.cta, bang: false },
  warn: { bg: C.danger, bang: true },
  danger: { bg: C.dangerInk, bang: true },
};

/** The 40px disc: a service sticker (+ tone mark) or a tone-filled icon disc, and the gold unread dot. */
export function NDisc({ service, icon, tone = "neutral", unread, size = 40 }: { service?: Service; icon?: IconName; tone?: Tone | "other"; unread?: boolean; size?: number }): React.ReactElement {
  const k = service ? KIND[service] : null;
  const t = TONE[tone];
  const m = k && tone !== "other" ? MARK[tone] : undefined;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, flexShrink: 0 }}>
      {k ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: k.tint, alignItems: "center", justifyContent: "center" }}>
          <k.Art width={Math.round(size * 0.72)} />
        </View>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: t.bg,
            borderWidth: t.border?.[0] ?? 0,
            borderColor: t.border?.[1],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon ?? "bell"} size={Math.round(size * 0.45)} color={t.fg} />
        </View>
      )}
      {m ? (
        <View
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: C.bg,
            backgroundColor: m.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {m.bang ? (
            <Text style={{ color: C.onAccent, fontSize: 12, lineHeight: 14, fontWeight: "800" }}>!</Text>
          ) : (
            <Icon name="check" size={11} color={C.onAccent} strokeWidth={3} />
          )}
        </View>
      ) : null}
      {unread ? (
        <View style={{ position: "absolute", top: -1, right: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.bg, backgroundColor: C.highlight }} />
      ) : null}
    </View>
  );
}

/** A white r16 card on the surface page; `danger` = the pinned danger card. */
export function NCard({ danger, children, style }: { danger?: boolean; children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return (
    <View style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: danger ? C.danger : C.line, borderRadius: 16, overflow: "hidden", ...style }}>{children}</View>
  );
}

/** TODAY · YESTERDAY · MON 28 SEP — 11/600 muted. */
export function Day({ children }: { children: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ fontSize: 11, lineHeight: 16, fontWeight: "600", letterSpacing: 0.44, color: C.muted, paddingTop: 6, paddingHorizontal: 4 }}>
      {children}
    </Text>
  );
}

/** Collapsed history: one quiet dot per earlier update (max 5). */
function Beads({ n }: { n: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      {Array.from({ length: Math.min(n, 5) }).map((_, i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.illusIdleMid }} />
      ))}
    </View>
  );
}

/** The inline timeline: vertical, small dots, clock on the right; steps[0] = latest. */
function Timeline({ steps }: { steps: NItem["steps"] }): React.ReactElement {
  return (
    <View style={{ marginTop: 8 }}>
      {steps.map((s, i) => {
        const now = i === 0;
        const last = i === steps.length - 1;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "stretch", gap: 10, minHeight: 30 }}>
            <View style={{ width: 12, alignItems: "center" }}>
              {last ? null : <View style={{ position: "absolute", top: 15, bottom: -15, width: 2, backgroundColor: C.line }} />}
              {now ? (
                <View style={{ marginTop: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: C.accentWash, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accentText }} />
                </View>
              ) : (
                <View style={{ marginTop: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
              )}
            </View>
            <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20, fontWeight: now ? "700" : "400", color: now ? C.ink : C.muted }}>{s.label}</Text>
            <Text style={{ fontSize: 12, lineHeight: 20, color: C.muted, ...TABULAR }}>{s.clock}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The row: one per order (its latest update) or one per account / money / safety event. Tapping the
 * bead line expands the timeline; tapping anywhere else opens the order, job or account screen.
 */
export function NRow({
  item,
  first,
  open,
  onToggle,
  onPress,
  onAction,
}: {
  item: NItem;
  first?: boolean;
  open?: boolean;
  onToggle: () => void;
  onPress: () => void;
  onAction: () => void;
}): React.ReactElement {
  const more = item.steps.length - 1;
  const hasMore = more > 0;
  const loose = hasMore || !!item.action;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: C.line, backgroundColor: C.bg }}>
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.unread ? "New. " : ""}${item.title}. ${item.line} ${item.time}`}
        style={{ flexDirection: "row", gap: 12, paddingTop: 12, paddingHorizontal: 12, paddingBottom: loose ? 4 : 12 }}
      >
        <NDisc service={item.service} icon={item.icon} tone={item.tone} unread={item.unread} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: item.unread ? "700" : "600", color: C.ink }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 12, color: item.unread ? C.ink : C.muted, fontWeight: item.unread ? "600" : "400", ...TABULAR }}>{item.time}</Text>
          </View>
          <Text style={{ fontSize: 13, lineHeight: 18, marginTop: 2, color: item.unread || item.tone === "danger" ? C.ink : C.muted }}>{item.line}</Text>
          {item.action ? (
            <View style={{ flexDirection: "row", marginTop: 10, marginBottom: hasMore ? 0 : 8 }}>
              <SmBtn kind="fill" label={item.action.label} onPress={onAction} />
            </View>
          ) : null}
        </View>
      </Tappable>
      {hasMore && !open ? (
        <Tappable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          style={{ marginLeft: 64, marginRight: 12, marginBottom: 0, height: 44, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}
        >
          <Beads n={more} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: C.muted }}>{earlier(more)}</Text>
          <Icon name="chevron-down" size={14} color={C.muted} />
        </Tappable>
      ) : null}
      {hasMore && open ? (
        <View style={{ marginLeft: 64, marginRight: 12 }}>
          <Timeline steps={item.steps} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            <Tappable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: true }} style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="chevron-up" size={15} color={C.muted} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.muted }}>{N.hide}</Text>
            </Tappable>
            <Tappable onPress={onPress} accessibilityRole="link" style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.accentText }}>{item.rider ? N.openJob : N.openOrder}</Text>
              <Icon name="chevron-right" size={16} color={C.accentText} />
            </Tappable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** README "Swipe": past 35% of the width removes the row; anything less snaps back (220 ms). */
export const SWIPE_REMOVE_AT = 0.35;
const CLAIM_DX = 10;

/**
 * Swipe either way: the row follows the finger and fades (1 → 0.3); the danger-wash strip behind it says
 * what letting go does. Core Animated + PanResponder (the app has no gesture-handler / reanimated).
 */
export function SwipeRow({ first, onRemove, children }: { first?: boolean; onRemove: () => void; children: React.ReactNode }): React.ReactElement {
  const dx = React.useRef(new Animated.Value(0)).current;
  const width = React.useRef(360);
  const [dir, setDir] = React.useState<1 | -1 | 0>(0);
  const removeRef = React.useRef(onRemove);
  removeRef.current = onRemove;
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        // Only a decidedly horizontal drag is a swipe; vertical drags stay the list's scroll, and plain
        // taps still reach the row (the responder is never claimed on a tap).
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > CLAIM_DX && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          dx.setValue(g.dx);
          setDir(g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0);
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > width.current * SWIPE_REMOVE_AT) {
            Animated.timing(dx, { toValue: g.dx > 0 ? width.current : -width.current, duration: 200, useNativeDriver: true }).start(() => removeRef.current());
          } else {
            Animated.timing(dx, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setDir(0));
          }
        },
        // A cancelled gesture (a call, a parent taking over) springs back — never removes.
        onPanResponderTerminate: () => {
          Animated.timing(dx, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setDir(0));
        },
      }),
    [dx],
  );
  const opacity = dx.interpolate({ inputRange: [-360, 0, 360], outputRange: [0.3, 1, 0.3], extrapolate: "clamp" });
  return (
    <View
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width || 360;
      }}
      style={{ overflow: "hidden", borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}
    >
      {dir !== 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: C.dangerWash,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: dir > 0 ? "flex-start" : "flex-end",
            paddingHorizontal: 20,
            gap: 6,
          }}
        >
          <Icon name="trash" size={18} color={C.dangerInk} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.dangerInk }}>{N.remove}</Text>
        </View>
      ) : null}
      <Animated.View
        {...pan.panHandlers}
        accessibilityActions={[{ name: "delete", label: N.remove }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "delete") removeRef.current();
        }}
        style={{ transform: [{ translateX: dx }], opacity }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** Rider v2 J8 warn row: notifications are off. Never blocks the list. */
export function OffRow({ rider, onTurnOn }: { rider: boolean; onTurnOn: () => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderColor: C.danger, borderRadius: 12, paddingVertical: 6, paddingRight: 6, paddingLeft: 12, backgroundColor: C.bg }}>
      <Icon name="bell-off" size={18} color={C.danger} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: C.ink }}>{rider ? N.offR : N.offC}</Text>
      <SmBtn kind="fill" label={N.turnOn} onPress={onTurnOn} />
    </View>
  );
}

/** Dual role (N4): the other side, as one quiet row. */
export function OtherSide({ rider, sub, onPress }: { rider: boolean; sub: string; onPress: () => void }): React.ReactElement {
  return (
    <NCard style={{ backgroundColor: C.surface }}>
      <Tappable onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 56 }}>
        <NDisc icon="arrow-left-right" tone="other" size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", lineHeight: 20, color: C.ink }}>{rider ? N.otherC : N.otherR}</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, color: C.muted }}>{sub}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={C.muted} />
      </Tappable>
    </NCard>
  );
}

/** A skeleton row: same geometry as a row. */
export function SkelRow({ first, w = "60%" }: { first?: boolean; w?: `${number}%` }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line, alignItems: "center" }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: SKELETON }} />
      <View style={{ flex: 1 }}>
        <View style={{ height: 12, width: w, backgroundColor: SKELETON, borderRadius: 6 }} />
        <View style={{ height: 10, width: "85%", backgroundColor: SKELETON, borderRadius: 5, marginTop: 8 }} />
      </View>
    </View>
  );
}

/** A skeleton day label. */
export function SkelDay({ w }: { w: number }): React.ReactElement {
  return <View style={{ height: 10, width: w, backgroundColor: SKELETON, borderRadius: 5, marginTop: 8, marginHorizontal: 4 }} />;
}

/** N8: the Calm Mint v2 empty card (mint wash, r20, trust-tracking). Customers get "Send a parcel". */
export function NEmpty({ rider, onSend }: { rider: boolean; onSend: () => void }): React.ReactElement {
  return (
    <View style={{ marginTop: 12, backgroundColor: C.accentWash, borderRadius: 20, padding: 20, alignItems: "center", gap: 6 }}>
      <TrustTrackingArt width={132} />
      <Text style={{ fontSize: 18, fontWeight: "700", lineHeight: 24, marginTop: 8, color: C.ink, textAlign: "center" }}>{rider ? N.emptyRT : N.emptyCT}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: C.muted, textAlign: "center", marginBottom: rider ? 4 : 10 }}>{rider ? N.emptyRB : N.emptyCB}</Text>
      {rider ? null : (
        <View style={{ alignSelf: "stretch", flexDirection: "row" }}>
          <CtaButton label={N.sendParcel} icon="package" onPress={onSend} />
        </View>
      )}
    </View>
  );
}

/** N10: couldn't load, nothing cached. */
export function NFail({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingBottom: 60 }}>
      <IconDisc name="wifi-off" size={72} />
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "700", lineHeight: 26, color: C.ink, textAlign: "center" }}>
        {N.failT}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: C.muted, textAlign: "center" }}>{N.failB}</Text>
      <View style={{ alignSelf: "stretch", flexDirection: "row", marginTop: 8 }}>
        <CtaButton label={N.tryAgain} icon="refresh-cw" onPress={onRetry} />
      </View>
    </View>
  );
}
