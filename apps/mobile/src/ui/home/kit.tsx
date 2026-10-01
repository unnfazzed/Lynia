import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { avatarTint } from "../../logic/avatar";
import { TrustTrackingArt } from "../art/TrustTrackingArt";
import { PharmacyStickerV2, RestaurantsSticker, SendStickerV2, ShopsSticker } from "../art/stickers";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { useTabBarSpace } from "../shell/TabShell";
import { Tappable } from "../Tappable";
import { H } from "./copy";

/**
 * The Calm Mint v2 customer Home kit (`packages/design/handoff/calm-mint-v2-2026-10`, README §2,
 * drawn by `mint2.js`; ledger docs/DESIGN-DEVIATIONS.md D-55). Every measurement below is the
 * handoff's. ZERO shadows on this screen: separation is tint + hairline only (README §1 "Depth").
 *
 * Values that are not design tokens (the handoff draws them as literals) live here as named
 * constants rather than inline, so a later export can retune them in one place.
 */
const SKELETON = "#EEF1F3";
const ON_FOREST_PILL = "rgba(255,255,255,0.14)";
const ON_FOREST_SEG_OFF = "rgba(255,255,255,0.22)";

/** Phones narrower than this get the H3 (320×640) variant: smaller tiles, "Food", shorter search. */
export const NARROW_MAX = 340;

// ── Header ─────────────────────────────────────────────────────────────────────────────────────

/** Header: mint, bottom radius 28, three decorative circles behind the content (README §2.2). */
export function HomeTop({
  narrow,
  address,
  noAddress,
  phrase,
  firstName,
  unread,
  onAddress,
  onBell,
  onSearch,
}: {
  narrow: boolean;
  address: string;
  noAddress: boolean;
  /** "Good morning" | "Good afternoon" | "Good evening". */
  phrase: string;
  firstName: string | null;
  unread: boolean;
  onAddress: () => void;
  onBell: () => void;
  onSearch: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  // The handoff draws a 28px status bar inside the header; the device's own inset takes its place.
  const top = insets.top;
  // The circles are placed against the DRAWN header (status bar included), so shift them by the
  // difference between the real inset and the drawn 28px: they keep their place against the content.
  const dy = top - 28;
  const circle = (size: number, color: string, pos: ViewStyle): React.ReactElement => (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, ...pos }}
    />
  );
  return (
    <View
      style={{
        backgroundColor: tokens.color.accentWash,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        paddingTop: top,
        paddingBottom: 18,
        overflow: "hidden",
      }}
    >
      {circle(150, tokens.color.highlight, { right: -62, top: -58 + dy })}
      {circle(26, tokens.color.coral, narrow ? { right: 14, top: 100 + dy } : { right: 78, top: 64 + dy })}
      {circle(14, tokens.color.sky, narrow ? { right: 50, top: 128 + dy } : { right: 30, top: 112 + dy })}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 6 }}>
        <Tappable
          onPress={onAddress}
          accessibilityRole="button"
          accessibilityLabel={noAddress ? `${H.setLocation}` : `${H.deliveringTo}: ${address}. Change`}
          style={{ flex: 1, minWidth: 0, minHeight: tokens.touchTargetMin, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.2, color: tokens.color.muted }}>
            {noAddress ? H.noAddress : H.deliveringTo}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="map-pin" size={16} color={noAddress ? tokens.color.danger : tokens.color.accent} />
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: noAddress ? tokens.color.dangerInk : tokens.color.ink }}
            >
              {noAddress ? H.setLocation : address}
            </Text>
            <Icon name="chevron-down" size={16} color={tokens.color.ink} />
          </View>
        </Tappable>
        <Tappable
          onPress={onBell}
          tone="icon"
          accessibilityRole="button"
          accessibilityLabel={unread ? "Notifications, unread" : "Notifications"}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" size={20} color={tokens.color.accentText} />
          {unread ? (
            <View
              style={{
                position: "absolute",
                top: 8,
                right: 9,
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: tokens.color.bg,
                backgroundColor: tokens.color.highlight,
              }}
            />
          ) : null}
        </Tappable>
      </View>

      <Text
        accessibilityRole="header"
        style={{
          paddingTop: 10,
          paddingHorizontal: 16,
          paddingBottom: 12,
          fontSize: 24,
          lineHeight: 27.6,
          letterSpacing: -0.4,
          fontWeight: tokens.font.weight.bold,
          color: tokens.color.ink,
        }}
      >
        {firstName ? `${phrase},${narrow ? "\n" : " "}` : phrase}
        {firstName ? <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{firstName}</Text> : null}
      </Text>

      <Tappable
        onPress={onSearch}
        accessibilityRole="search"
        accessibilityLabel={narrow ? H.searchNarrow : H.search}
        style={{
          marginHorizontal: 16,
          height: 48,
          borderRadius: tokens.radius.input,
          backgroundColor: tokens.color.bg,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
        }}
      >
        <Icon name="search" size={18} color={tokens.color.muted} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>
          {narrow ? H.searchNarrow : H.search}
        </Text>
      </Tappable>
    </View>
  );
}

// ── Service tiles ──────────────────────────────────────────────────────────────────────────────

export type ServiceId = "send" | "food" | "shops" | "pharmacy";

const TILE_ART: Record<ServiceId, (p: { width: number }) => React.ReactElement> = {
  send: SendStickerV2,
  food: RestaurantsSticker,
  shops: ShopsSticker,
  pharmacy: PharmacyStickerV2,
};

const TILES: ReadonlyArray<{ id: ServiceId; fill: string }> = [
  { id: "send", fill: tokens.color.tileSend },
  { id: "food", fill: tokens.color.tileFood },
  { id: "shops", fill: tokens.color.tileShops },
  { id: "pharmacy", fill: tokens.color.tilePharmacy },
];

function tileLabel(id: ServiceId, narrow: boolean): string {
  if (id === "food") return narrow ? H.tiles.foodNarrow : H.tiles.food;
  return H.tiles[id];
}

/** Four live tiles in one row: fill per token, 54px sticker (44 at 320), label 12/600 under the tile. */
export function ServiceGrid({ narrow, onTile }: { narrow: boolean; onTile: (id: ServiceId) => void }): React.ReactElement {
  const sticker = narrow ? 44 : 54;
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingTop: 16, paddingHorizontal: 16 }}>
      {TILES.map((t) => {
        const Art = TILE_ART[t.id];
        const label = tileLabel(t.id, narrow);
        return (
          <Tappable
            key={t.id}
            onPress={() => onTile(t.id)}
            accessibilityRole="button"
            accessibilityLabel={t.id === "food" ? H.tiles.food : label}
            style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 6 }}
          >
            <View
              style={{
                width: "100%",
                height: narrow ? 64 : 76,
                borderRadius: 16,
                backgroundColor: t.fill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View accessibilityElementsHidden importantForAccessibility="no">
                <Art width={sticker} />
              </View>
            </View>
            <Text numberOfLines={1} style={{ fontSize: narrow ? 11 : 12, fontWeight: tokens.font.weight.semibold, letterSpacing: -0.2, color: tokens.color.ink }}>
              {label}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
}

// ── Rails ──────────────────────────────────────────────────────────────────────────────────────

/** A rail header + a horizontally scrolling row of cards (README §2.4). */
export function VenueRail({
  title,
  sub,
  sticker,
  onSeeAll,
  children,
}: {
  title: string;
  sub: string;
  sticker: "food" | "shops";
  onSeeAll: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const Art = sticker === "food" ? RestaurantsSticker : ShopsSticker;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, marginTop: 24, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View accessibilityElementsHidden importantForAccessibility="no">
              <Art width={28} />
            </View>
            <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, fontSize: 18, fontWeight: tokens.font.weight.bold, letterSpacing: -0.3, color: tokens.color.ink }}>
              {title}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12.5, color: tokens.color.muted }}>
            {sub}
          </Text>
        </View>
        <Tappable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${H.seeAll} — ${title}`}
          hitSlop={6}
          style={{ minHeight: 32, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{H.seeAll}</Text>
        </Tappable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {children}
      </ScrollView>
    </View>
  );
}

export const VENUE_CARD_WIDTH = 148;

const pill = (bg: string): ViewStyle => ({ position: "absolute", borderRadius: tokens.radius.pill, backgroundColor: bg });

/** A shop kind's no-photo tint + ink (README §2.5). */
export function kindColors(kind: string | null): { bg: string; ink: string } {
  switch (kind) {
    case "Pharmacy":
      return { bg: tokens.color.tilePharmacyWash, ink: tokens.color.accentText };
    case "Grocery":
      return { bg: tokens.color.accentWash, ink: tokens.color.accentText };
    case "Butchery":
      return { bg: tokens.color.kindButchery, ink: tokens.color.dangerInk };
    case "Fashion":
      return { bg: tokens.color.kindFashion, ink: tokens.color.kindFashionInk };
    case "Auto parts":
      return { bg: tokens.color.kindAuto, ink: tokens.color.kindAutoInk };
    default:
      return { bg: tokens.color.surface, ink: tokens.color.ink };
  }
}

/** One rail card: 96px image, ETA pill, optional Free tag / kind chip, name, star · rating · fee. */
export function VenueCard({
  name,
  photoUrl,
  kind = null,
  rating,
  etaMinutes,
  deliveryFee,
  freeDelivery = false,
  closed = false,
  onPress,
}: {
  name: string;
  photoUrl: string | null;
  /** A shop's kind label ("Pharmacy"); null for a restaurant. */
  kind?: string | null;
  rating: string | null;
  etaMinutes: number | null;
  deliveryFee: string | null;
  freeDelivery?: boolean;
  closed?: boolean;
  onPress: () => void;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const photo = !!photoUrl && !failed;
  const tint = kind ? kindColors(kind) : { bg: avatarTint(name), ink: tokens.color.ink };
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${closed ? " — closed" : ""}`}
      style={{ width: VENUE_CARD_WIDTH, opacity: closed ? 0.65 : 1 }}
    >
      <View style={{ height: 96, borderRadius: 14, overflow: "hidden", backgroundColor: photo ? tokens.color.surface : tint.bg, alignItems: "center", justifyContent: "center" }}>
        {photo ? (
          <RemoteImage
            source={{ uri: photoUrl! }}
            onError={() => setFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <Text style={{ fontSize: 36, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{name.trim().charAt(0).toUpperCase()}</Text>
        )}
        {freeDelivery ? (
          <View style={{ ...pill(tokens.color.free), left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10.5, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{H.freeDelivery}</Text>
          </View>
        ) : null}
        {kind && !photo ? (
          <View style={{ ...pill(tokens.color.bg), left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10.5, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{kind}</Text>
          </View>
        ) : null}
        {etaMinutes != null ? (
          <View style={{ ...pill(tokens.color.bg), right: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{H.eta(etaMinutes)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 8, fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {name}
      </Text>
      <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 }}>
        {rating ? (
          <>
            <Icon name="star" size={12} color={tokens.color.starStroke} fill={tokens.color.highlight} />
            <Text style={{ fontSize: 12.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{rating}</Text>
          </>
        ) : null}
        {!freeDelivery && deliveryFee ? (
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
            {rating ? "· " : ""}
            {H.delivery(deliveryFee)}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

/** H4 — a skeleton rail: a title bar and three placeholder cards. */
export function RailSkeleton(): React.ReactElement {
  const bar = (w: number | `${number}%`, h: number, mt = 0, r = 12): React.ReactElement => (
    <View style={{ width: w, height: h, marginTop: mt, borderRadius: r, backgroundColor: SKELETON }} />
  );
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 10 }}>{bar(150, 18)}</View>
      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, overflow: "hidden" }}>
        {[0, 1, 2].map((k) => (
          <View key={k} style={{ width: VENUE_CARD_WIDTH }}>
            {bar("100%", 96, 0, 14)}
            {bar(110, 12, 10)}
            {bar(70, 10, 6)}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Live-order bar ─────────────────────────────────────────────────────────────────────────────

/** H1 — the one floating live-order bar, 12px from the sides and 12 above the floating tab bar (tab bar v1). */
export function LiveOrderBar({
  icon,
  title,
  sub,
  more,
  step,
  steps,
  etaMinutes,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub: string;
  /** Other running orders beyond this one (0 hides the pill). */
  more: number;
  step: number;
  steps: number;
  etaMinutes: number | null;
  onPress: () => void;
}): React.ReactElement {
  // The tab bar floats (tab bar v1, D-56) and takes no layout space, so the bar clears its reserve.
  const tabSpace = useTabBarSpace();
  return (
    <Tappable
      onPress={onPress}
      tone="onDark"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}${more > 0 ? `. ${H.moreOrders(more)}` : ""}${etaMinutes != null ? `. ${H.eta(etaMinutes)}` : ""}`}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: tabSpace + 12,
        borderRadius: 18,
        backgroundColor: tokens.color.forest,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 12,
        paddingRight: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={tokens.color.onAccent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>
          {title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: tokens.color.onForestMuted }}>
            {sub}
            {more > 0 ? " ·" : ""}
          </Text>
          {more > 0 ? (
            <View style={{ borderRadius: tokens.radius.pill, backgroundColor: ON_FOREST_PILL, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.onForestMuted }}>{H.moreOrders(more)}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 3, marginTop: 6, width: 150 }}>
          {Array.from({ length: steps }, (_, k) => (
            <View key={k} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: k <= step ? tokens.color.accent : ON_FOREST_SEG_OFF }} />
          ))}
        </View>
      </View>
      {etaMinutes != null ? (
        <View style={{ borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlight, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightChipInk, fontVariant: ["tabular-nums"] }}>{H.eta(etaMinutes)}</Text>
        </View>
      ) : null}
    </Tappable>
  );
}

// ── H6 — no address yet ────────────────────────────────────────────────────────────────────────

/** A pill button with an optional leading icon — primary (cta fill) or a text-weight ghost. */
export function PillButton({
  label,
  icon,
  ghost = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  ghost?: boolean;
  onPress: () => void;
}): React.ReactElement {
  const ink = ghost ? tokens.color.accentText : tokens.color.onAccent;
  return (
    <Tappable
      onPress={onPress}
      tone={ghost ? "row" : "onDark"}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: ghost ? 48 : tokens.touchTargetPrimary,
        borderRadius: tokens.radius.button,
        backgroundColor: ghost ? "transparent" : tokens.color.cta,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={ink} /> : null}
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: ink }}>{label}</Text>
    </Tappable>
  );
}

/** The mint card that replaces the rails when there is no address (H6) or nothing nearby. */
export function NoLocationCard({
  title,
  onUseLocation,
  onTypeAddress,
}: {
  title: string;
  onUseLocation: () => void;
  onTypeAddress: () => void;
}): React.ReactElement {
  return (
    <View style={{ marginTop: 24, marginHorizontal: 16, padding: 20, borderRadius: 20, backgroundColor: tokens.color.accentWash, alignItems: "stretch" }}>
      <View style={{ alignItems: "center" }} accessibilityElementsHidden importantForAccessibility="no">
        <TrustTrackingArt width={132} />
      </View>
      <Text accessibilityRole="header" style={{ marginTop: 8, textAlign: "center", fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {title}
      </Text>
      <Text style={{ marginTop: 6, marginBottom: 16, textAlign: "center", fontSize: 14, lineHeight: 20.3, color: tokens.color.muted }}>{H.noLocBody}</Text>
      <PillButton label={H.useMyLocation} icon="navigation" onPress={onUseLocation} />
      <View style={{ marginTop: 8 }}>
        <PillButton label={H.typeAddress} ghost onPress={onTypeAddress} />
      </View>
    </View>
  );
}
