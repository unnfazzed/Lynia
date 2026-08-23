import type { LatLng, RestaurantListItem } from "@lynia/shared";
import { Tappable } from "../Tappable";
import { tokens } from "@lynia/shared/tokens";
import { isMerchantOpenNow, minutesUntilClose, nextOpenDescription } from "@lynia/shared";
import React from "react";
import { Text, View, type TextStyle } from "react-native";
import { etaRange, restaurantMeta } from "../../logic/food-list";
import { formatMoney } from "../../logic/money";
import { Card } from "../index";
import { FoodThumb } from "./FoodThumb";

const TABULAR: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** A pill beside the name — "Closed" or "Closing in N min". Kit RestRow (r-parts.jsx:337-338) draws
 *  a static "Closes 21:00"; the app shows its own live-derived minutes-remaining in the same slot
 *  instead of computing a wall-clock string the mock never needed a helper for. */
function NameBadge({ open, closingIn }: { open: boolean; closingIn: number | null }): React.ReactElement | null {
  if (!open) {
    return (
      <Text style={{ fontSize: 11, fontWeight: "700", color: tokens.color.muted, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden", flexShrink: 0 }}>
        Closed
      </Text>
    );
  }
  if (closingIn != null) {
    return (
      <Text style={{ fontSize: 11, fontWeight: "700", color: tokens.color.highlightInk, backgroundColor: tokens.color.highlightWash, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden", flexShrink: 0 }}>
        Closing in {closingIn} min
      </Text>
    );
  }
  return null;
}

/** Kit RestRow (r-parts.jsx:340-349): ★ rating (n) · <km> km · <eta> min, then the delivery fee on
 *  its own line. Every piece is independently omitted when the app has no honest value for it — an
 *  unrated shop shows no star, no customer fix means no distance/eta/fee (never an invented figure). */
function MetaLines({ r, meta, open, closedNote }: { r: RestaurantListItem; meta: ReturnType<typeof restaurantMeta>; open: boolean; closedNote: string | null }): React.ReactElement | null {
  const etaBand = open && meta.etaMinutes != null ? etaRange([meta]) : null;
  const hasMetaLine = meta.rating != null || meta.distanceKm != null || etaBand != null || closedNote != null;
  return (
    <>
      {hasMetaLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 6 }}>
          {meta.rating != null ? (
            <Text style={{ fontSize: 12.5, ...TABULAR }}>
              <Text style={{ color: tokens.color.highlight }}>★</Text> <Text style={{ fontWeight: "700", color: tokens.color.ink }}>{meta.rating.toFixed(1)}</Text>
              {r.ratingCount > 0 ? <Text style={{ color: tokens.color.muted }}> ({r.ratingCount})</Text> : null}
            </Text>
          ) : null}
          {meta.distanceKm != null ? <Text style={{ fontSize: 12.5, color: tokens.color.muted, ...TABULAR }}>{meta.distanceKm.toFixed(1)} km</Text> : null}
          {etaBand ? (
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.ink, ...TABULAR }}>
              {etaBand.low}–{etaBand.high} min
            </Text>
          ) : closedNote ? (
            <Text style={{ fontSize: 12.5, color: tokens.color.muted }} numberOfLines={1}>
              {closedNote}
            </Text>
          ) : null}
        </View>
      ) : null}
      {open && meta.feeUsd != null ? (
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText, marginTop: 3, ...TABULAR }}>{formatMoney(meta.feeUsd)} delivery</Text>
      ) : null}
    </>
  );
}

/** R1·1 restaurant row: photo-led, open/closed derived from `hours`. Kit RestRow (r-parts.jsx:334-384)
 *  — the FIRST row of RC.list renders as the mock's hero card (full-bleed 130px photo band + a
 *  floating ETA pill), every other row and every RC.search result is the compact 96px-thumb card;
 *  both share the same name/kind/meta/fee body. */
export function RestaurantRow({
  r,
  onPress,
  now,
  customerPoint,
  hero = false,
}: {
  r: RestaurantListItem;
  onPress: () => void;
  now: Date;
  /** The customer's live fix (`useHomeLocation().point`) — feeds `restaurantMeta`'s distance/eta/fee,
   *  same path the header's results-summary line and the checkout estimate use. Null renders those
   *  pieces omitted, never a fabricated number. */
  customerPoint: LatLng | null;
  hero?: boolean;
}): React.ReactElement {
  const open = isMerchantOpenNow(r.hours, now);
  const closingIn = open ? minutesUntilClose(r.hours, now) : null;
  const closedNote = !open ? nextOpenDescription(r.hours, now) : null;
  const meta = restaurantMeta(r, customerPoint);
  const etaBand = open && meta.etaMinutes != null ? etaRange([meta]) : null;

  const nameRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
        {r.name}
      </Text>
      <NameBadge open={open} closingIn={closingIn} />
    </View>
  );
  const kindLine =
    r.cuisineTags.length > 0 ? (
      <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
        {r.cuisineTags.join(" · ")}
      </Text>
    ) : null;
  const a11yLabel = `${r.name}${open ? "" : " — closed"}`;

  if (hero) {
    return (
      <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yLabel}>
        <Card style={{ padding: 0, overflow: "hidden", opacity: open ? 1 : 0.72 }}>
          <View style={{ height: 130 }}>
            <FoodThumb name={r.name} photoUrl={r.coverPhotoUrl} size={96} radius={0} style={{ width: "100%", height: 130 }} />
            {etaBand ? (
              <View style={{ position: "absolute", right: 10, bottom: 10, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.pill, paddingHorizontal: 11, paddingVertical: 4, ...tokens.shadow.card }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: tokens.color.ink, ...TABULAR }}>
                  {etaBand.low}–{etaBand.high} min
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ padding: 12 }}>
            {nameRow}
            {kindLine}
            <MetaLines r={r} meta={meta} open={open} closedNote={closedNote} />
          </View>
        </Card>
      </Tappable>
    );
  }

  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      <Card style={{ opacity: open ? 1 : 0.72 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <FoodThumb name={r.name} photoUrl={r.coverPhotoUrl} size={96} radius={14} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {nameRow}
            {kindLine}
            <MetaLines r={r} meta={meta} open={open} closedNote={closedNote} />
          </View>
        </View>
      </Card>
    </Tappable>
  );
}
