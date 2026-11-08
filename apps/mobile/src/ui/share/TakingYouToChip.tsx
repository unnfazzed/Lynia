import type { ShopShareCardResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { getShopCard } from "../../api/share";
import { loadPendingShop } from "../../share/pending-shop";
import { initial, kindTint } from "../browse/kit";
import { Icon } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { fill, SH } from "./copy";

/** What the chip needs: the pending code, and the shop's public card once it answers (null = no name to show). */
export interface PendingShopView {
  code: string;
  card: ShopShareCardResponse | null;
}

/**
 * The shop a share link is taking this signed-out person to, for the sign-in screens. `undefined` while reading,
 * `null` with no link pending. A card that can't be read (offline, a shop that went quiet) leaves `card` null and
 * the chip says "the shop" (SH-S5).
 */
export function usePendingShop(): PendingShopView | null | undefined {
  const [view, setView] = useState<PendingShopView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadPendingShop().then((p) => {
      if (!live) return;
      if (!p) return setView(null);
      setView({ code: p.code, card: null });
      getShopCard(p.code).then(
        (card) => live && setView({ code: p.code, card }),
        () => undefined,
      );
    });
    return () => {
      live = false;
    };
  }, []);
  return view;
}

/** No-photo logo tint, as Browse v2 draws it: the kind's tint for shops and pharmacies, the warm tint for kitchens. */
function tintOf(card: ShopShareCardResponse): { bg: string; ink: string } {
  if (card.service === "pharmacy") return kindTint("Pharmacy");
  const kind = card.shopKind ? card.shopKind.charAt(0).toUpperCase() + card.shopKind.slice(1).replace(/_/g, " ") : null;
  return kindTint(kind);
}

/**
 * The "Taking you to" chip (handoff shop-share-v1 README §4 "Chip", SH-S1–S6). Not tappable, no Back of its own:
 * inline-flex, min-height 44, radius 22, padding 6 14 6 6, accent wash, gap 10; a 32 logo (photo, or tint +
 * initial) or, with no name, a 32 white disc with `store`; "Taking you to" 12 muted over the name 14/700, 2 lines.
 */
export function TakingYouToChip({ shop, style }: { shop: PendingShopView; style?: object }): React.ReactElement {
  const card = shop.card;
  const name = card?.name ?? SH.chip.noName;
  const tint = card ? tintOf(card) : null;
  return (
    <View
      testID="taking-you-to-chip"
      accessible
      accessibilityRole="text"
      accessibilityLabel={fill(SH.chip.a11y, { shop: name })}
      style={[
        {
          alignSelf: "flex-start",
          maxWidth: "100%",
          minHeight: 44,
          borderRadius: 22,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 6,
          paddingRight: 14,
          gap: 10,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tokens.color.accentWash,
        },
        style,
      ]}
    >
      {card?.logoThumbUrl ? (
        <RemoteImage source={{ uri: card.logoThumbUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
      ) : card && tint ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tint.bg, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{initial(card.name)}</Text>
        </View>
      ) : (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
          <Icon name="store" size={16} color={tokens.color.accentText} />
        </View>
      )}
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{SH.chip.lead}</Text>
        <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {name}
        </Text>
      </View>
    </View>
  );
}
