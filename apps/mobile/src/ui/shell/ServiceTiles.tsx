import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { FoodSticker, PharmacySticker, SendSticker } from "../home/ServiceStickers";

/** Which sticker a tile draws. Not an `IconName`: 8c's tiles carry flat SVG artwork, not line icons. */
export type ServiceSticker = "send" | "food" | "pharmacy";

export type ServiceTile = {
  id: string;
  sticker: ServiceSticker;
  label: string;
  /** Tile background. */
  bg: string;
  /** The 42px blob behind the sticker — one shade deeper than `bg`. */
  blob: string;
  /** Drawn sticker width in px (the mock's `<img style="width:N">`). */
  width: number;
  /** Extra top offset the mock gives the sticker inside its 44px stage. */
  offsetTop?: number;
  /** Renders the gold SOON chip. A soon tile stays PRESSABLE — it opens the notify-me sheet. */
  soon?: boolean;
};

/**
 * The launcher services, home 8c (`packages/design/handoff/home-8c`). Three equal columns with the
 * label INSIDE the tile; adding a vertical is one more tile, never a nav change.
 *
 * Every value here is the handoff's: washes `accentWash` / `tileFoodWash` / `tilePharmacyWash`,
 * blobs one shade deeper, sticker widths 50 / 56 / 53 with food +4px and pharmacy +3px of top
 * offset. The pre-8c set ("Send · Parcel", "Food · Restaurants", "Pharmacy · Soon" over 62px green
 * round-squares with a sub-label each) is retired: 8c draws ONE label per tile, and "Food" is
 * "Restaurants".
 */
export const SERVICES: ServiceTile[] = [
  { id: "express", sticker: "send", label: "Send", bg: tokens.color.accentWash, blob: tokens.color.tileSendBlob, width: 50 },
  { id: "food", sticker: "food", label: "Restaurants", bg: tokens.color.tileFoodWash, blob: tokens.color.tileFoodBlob, width: 56, offsetTop: 4 },
  { id: "pharm", sticker: "pharmacy", label: "Pharmacy", bg: tokens.color.tilePharmacyWash, blob: tokens.color.tilePharmacyBlob, width: 53, offsetTop: 3, soon: true },
];

/**
 * `RESTAURANTS_ENABLED` escape hatch (plan §1: "flags become kill switches, not reveal tools"): with
 * the flag off, Restaurants takes the same SOON treatment Pharmacy carries, so the grid never
 * reflows and support can flip the switch back without a release. Under 8c a SOON tile is no longer
 * grey and inert — it keeps its wash and its sticker and opens the notify-me sheet, because the
 * handoff's rule is that the Pharmacy tile is "never dead", and a flag-off Restaurants tile has
 * exactly the same job.
 *
 * `SERVICES` itself never imports a flag; callers derive the list from the fetched value, keeping
 * this pure and easy to unit test.
 */
export function getServiceTiles(restaurantsEnabled: boolean): ServiceTile[] {
  if (restaurantsEnabled) return SERVICES;
  return SERVICES.map((s) => (s.id === "food" ? { ...s, soon: true } : s));
}

/** The 42px blob sits 1.68px below the stage's centre — the mock's `translate(-50%,-46%)`. */
const STAGE_HEIGHT = 44;
const BLOB_SIZE = 42;
const BLOB_TOP = STAGE_HEIGHT / 2 - BLOB_SIZE * 0.46;

const STICKERS = { send: SendSticker, food: FoodSticker, pharmacy: PharmacySticker } as const;

/**
 * Home 8c service tiles — the launcher grid. Chowdeck-scale pressables: radius 16, padding
 * `10 4 9`, a 44px icon stage over a tinted blob, and a 12px REGULAR label (never bold). No shadow,
 * no elevation, no ripple recolour — the press state is the mock's scale 0.97.
 */
export function ServiceTiles({
  services = SERVICES,
  onService,
  dim = false,
}: {
  services?: ServiceTile[];
  onService?: (id: string) => void;
  dim?: boolean;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 14, opacity: dim ? 0.5 : 1 }}>
      {services.map((s) => {
        const Sticker = STICKERS[s.sticker];
        return (
          <Pressable
            key={s.id}
            onPress={onService ? () => onService(s.id) : undefined}
            disabled={!onService}
            accessibilityRole={onService ? "button" : undefined}
            accessibilityLabel={s.soon ? `${s.label} — coming soon` : s.label}
            android_ripple={null}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              gap: 6,
              backgroundColor: s.bg,
              borderRadius: 16,
              paddingTop: 10,
              paddingHorizontal: 4,
              paddingBottom: 9,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            {s.soon ? (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  backgroundColor: tokens.color.highlight,
                  borderRadius: tokens.radius.pill,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontSize: 8.5, fontWeight: "800", letterSpacing: 0.34, color: tokens.color.highlightChipInk }}>SOON</Text>
              </View>
            ) : null}
            <View style={{ height: STAGE_HEIGHT, alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
              <View
                style={{ position: "absolute", top: BLOB_TOP, width: BLOB_SIZE, height: BLOB_SIZE, borderRadius: BLOB_SIZE / 2, backgroundColor: s.blob }}
              />
              <View style={{ marginTop: s.offsetTop ?? 0 }}>
                <Sticker width={s.width} />
              </View>
            </View>
            <Text style={{ fontSize: 12, fontWeight: "400", letterSpacing: 0.12, color: tokens.color.ink }}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
