import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../Icon";
import { MoonSticker, SunSticker } from "./ServiceStickers";

/** The bell's round button, and the time-of-day sticker sized to match it. */
const BELL_SIZE = 42;
const TIME_STICKER = BELL_SIZE;

/**
 * The 8c mint header (`packages/design/handoff/home-8c`, DS card `ui_kits/mobile/home-8c.html`) —
 * the shared TOP CARD for both root tabs: the customer home and the rider board (owner instruction
 * 2026-08-17, "the same design language for the Rider home page"). It replaced the accent-green
 * `BrandHeader` on both; inner screens keep their plain white app bars, unchanged.
 *
 * What it draws, top to bottom:
 *   · an `accentWash` block with a SQUARE bottom edge and 24px of bottom padding. Nothing floats
 *     over the seam — the pre-8c search bar's `marginTop: -22` overhang is gone with the green.
 *   · the greeting, 25px/700 ink, time-aware, broken over TWO lines (phrase, then name).
 *   · a 42px WHITE circle bell with a gold unread dot, and the time-of-day sticker sized to match
 *     it, the two in one row so they read as a pair. NO avatar button — the bell is the only round
 *     action in the header (the mock draws one; "not drawn ⇒ not rendered").
 *   · `subRow` — whatever live state that face puts 11px under the greeting. The customer passes
 *     `HomeAddressRow` (the detected deliver-to); the rider passes `HomeStatusRow` (the shift).
 *     It is a SLOT rather than a fixed address row precisely because the two faces answer different
 *     questions in the same drawn shape: "where is this going?" vs "am I taking work?".
 *   · `search` — the deliberately quiet search bar: white, radius 12 (NOT a pill), padding 10×15,
 *     12.5px muted placeholder, and it must not outweigh the greeting or what follows. Omit the
 *     prop entirely for a face with nothing to search; the rider board does (owner instruction,
 *     same session).
 *
 * ZERO shadows anywhere on this screen (the handoff's hard rule, Android elevation included), so
 * nothing here spreads `tokens.shadow.*`.
 */
export function HomeHeader({
  greeting,
  evening = false,
  unread = false,
  subRow,
  search,
  onBell,
}: {
  /** The whole greeting, newlines included ("Good morning,\nRudo") — built by `logic/greeting.ts`. */
  greeting: string;
  evening?: boolean;
  unread?: boolean;
  /** The live-state row under the greeting. Omitted → the greeting sits alone. */
  subRow?: React.ReactNode;
  /** The quiet search bar. Omitted → no search bar is rendered at all. */
  search?: { placeholder?: string; onPress?: () => void };
  onBell?: () => void;
}): React.ReactElement {
  // Full-bleed: the mint block runs behind the status bar, so it owns the top inset rather than
  // stopping at the safe-area edge (the same exception BrandHeader took for the green block).
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, paddingTop: insets.top, paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* TWO LINES by construction — `greetingLine` puts the phrase on the first and the name on
              the second (owner instruction 2026-08-17), instead of letting the ~216px column decide
              and so changing the header's height with the time of day. `lineHeight` is Inter's own
              25 × 1.21, matching the reference's line box exactly. */}
          <Text numberOfLines={2} style={{ fontSize: 25, lineHeight: 30.25, fontWeight: "700", letterSpacing: -0.25, color: tokens.color.ink }}>
            {greeting}
          </Text>
          {subRow ? <View style={{ marginTop: 11 }}>{subRow}</View> : null}
        </View>
        {/* The sticker and the bell are ONE aligned pair (owner instruction 2026-08-17): the sticker
            is sized to the bell's 42px button — the reference draws it at 46 — and both sit in this
            row so they share a vertical centre no matter how tall the greeting column grows. Sizing
            them off one constant is what keeps them a pair if either changes. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* Decorative — the greeting text already says which half of the day it is. */}
          <View accessibilityElementsHidden importantForAccessibility="no">
            {evening ? <MoonSticker size={TIME_STICKER} /> : <SunSticker size={TIME_STICKER} />}
          </View>
          <Pressable
            onPress={onBell}
            disabled={!onBell}
            accessibilityRole="button"
            accessibilityLabel={unread ? "Notifications, unread" : "Notifications"}
            style={{
              width: BELL_SIZE,
              height: BELL_SIZE,
              borderRadius: BELL_SIZE / 2,
              backgroundColor: tokens.color.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="bell" size={18} color={tokens.color.accentText} />
            {unread ? (
              <View
                style={{
                  position: "absolute",
                  top: 9,
                  right: 10,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: tokens.color.highlight,
                  borderWidth: 1.5,
                  borderColor: tokens.color.bg,
                }}
              />
            ) : null}
          </Pressable>
        </View>
      </View>
      {search ? (
        <Pressable
          onPress={search.onPress}
          disabled={!search.onPress}
          accessibilityRole={search.onPress ? "button" : undefined}
          accessibilityLabel={search.placeholder}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
            marginHorizontal: 18,
            backgroundColor: tokens.color.bg,
            borderRadius: tokens.radius.input,
            paddingHorizontal: 15,
            paddingVertical: 10,
          }}
        >
          <Icon name="search" size={16} color={tokens.color.muted} />
          <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{search.placeholder}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The CUSTOMER's `subRow` — the detected deliver-to address: a 13px map-pin, the street line in
 * 12.5/600 `accentText`, and a chevron; tapping it opens the location sheet. It lives beside the
 * header it fills rather than in the screen, so the two faces' sub-rows stay visibly one shape.
 */
export function HomeAddressRow({ address, onPress }: { address: string; onPress?: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Deliver to ${address}. Change location` : undefined}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Icon name="map-pin" size={13} color={tokens.color.accentText} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: "600", color: tokens.color.accentText }}>
        {address}
      </Text>
      <Icon name="chevron-down" size={13} color={tokens.color.accentText} />
    </Pressable>
  );
}

/**
 * The RIDER's `subRow` — the same drawn shape, answering the rider's equivalent live question: am I
 * taking work? A status dot, one line, and the shift action where the customer's chevron sits.
 *
 * The dot is honest about the connection: `accent` while the board socket is live, `muted` while
 * reconnecting — a rider who has lost the socket must not read as fully online. The action carries
 * a real label ("Go offline" / "Go online") rather than a glyph: ending a shift is not something to
 * leave to an icon, and it is the one control on this screen with a cost attached.
 */
export function HomeStatusRow({
  label,
  detail,
  connected,
  actionLabel,
  onAction,
  busy = false,
}: {
  label: string;
  detail?: string;
  connected: boolean;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: connected ? tokens.color.accent : tokens.color.muted }} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: "600", color: tokens.color.accentText }}>
        {detail ? `${label} · ${detail}` : label}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={{ marginLeft: "auto", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
