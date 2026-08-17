import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { Icon } from "./Icon";
import { Money } from "./Money";

/**
 * Menu item row — the RN port of the design kit's `MenuRow` (r-parts.jsx :: MenuRow): name, one-line
 * description, price (with an "Out of stock today" pill when unavailable) on the left; a 68px dish
 * thumbnail with the 44px add/quantity target overhanging its bottom-right corner. An out-of-stock
 * row stays visible but dimmed (D-10: never hidden), and drops its add target.
 *
 * This is a codegen TARGET primitive: the transpiler emits `<MenuRow i=… qty=… cat=… />` verbatim,
 * so the prop shape mirrors the kit exactly (item object `i`, in-cart `qty`, category tint `cat`) and
 * lives at the ui root so codegen output resolves it off `src/ui`. Every colour/radius/shadow is a
 * token.
 *
 * Fidelity note — the kit's thumbnail `photo` state is a design-tool placeholder (a grey band bearing
 * the string "dish photo"), because the mock has no asset. Here `i.photo` is widened: a URI string
 * renders the real `Image`; `false` renders the kit's exact photoless block (category-tint tile + the
 * dish initial + a utensils/bag glyph); anything else falls back to that same tinted block rather
 * than draw placeholder chrome the user would never see.
 */
export interface MenuRowItem {
  name: string;
  desc?: string;
  price: number | string;
  /** Out of stock today — the row stays visible but dimmed and un-addable. */
  oos?: boolean;
  /** A real image URI shows the photo; `false`/absent shows the tinted-initial fallback. */
  photo?: boolean | string;
}

export type MenuCategory = "mains" | "sides" | "drinks";

// Kit CAT map (r-parts.jsx): [tile wash, glyph/initial ink] per category.
const CAT: Record<MenuCategory, { bg: string; fg: string }> = {
  mains: { bg: tokens.color.accentWash, fg: tokens.color.accentText },
  sides: { bg: tokens.color.surface, fg: tokens.color.muted },
  drinks: { bg: tokens.color.highlightWash, fg: tokens.color.highlightInk },
};

const THUMB = 68;
const THUMB_RADIUS = 12;

function Thumb({ name, cat, photo }: { name: string; cat: MenuCategory; photo?: boolean | string }): React.ReactElement {
  const { bg, fg } = CAT[cat] ?? CAT.mains;
  const [failed, setFailed] = useState(false);
  const uri = typeof photo === "string" && photo.length > 0 ? photo : null;
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: THUMB, height: THUMB, borderRadius: THUMB_RADIUS, backgroundColor: tokens.color.surface }}
      />
    );
  }
  const initial = ([...name.trim()][0] || "•").toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: THUMB, height: THUMB, borderRadius: THUMB_RADIUS, backgroundColor: bg, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}
    >
      <Text style={{ fontSize: Math.round(THUMB * 0.42), fontWeight: "800", color: fg, opacity: 0.9, lineHeight: Math.round(THUMB * 0.42) }}>{initial}</Text>
      <Icon name={cat === "drinks" ? "shopping-bag" : "utensils"} size={13} color={fg} style={{ position: "absolute", right: 5, bottom: 5, opacity: 0.55 }} />
    </View>
  );
}

export function MenuRow({
  i,
  qty,
  cat = "mains",
}: {
  i: MenuRowItem;
  /** Quantity already in the cart — shows the filled count badge instead of a plus. */
  qty?: number;
  cat?: MenuCategory;
}): React.ReactElement {
  const oos = !!i.oos;
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tokens.color.line, opacity: oos ? 0.55 : 1 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: tokens.color.ink }}>{i.name}</Text>
        {i.desc ? <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2, lineHeight: 17 }}>{i.desc}</Text> : null}
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Money v={i.price} size={14} />
          {oos ? (
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, backgroundColor: tokens.color.surface, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: "hidden" }}>
              Out of stock today
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ position: "relative", flexShrink: 0, paddingBottom: 8, paddingRight: 4 }}>
        <Thumb name={i.name} cat={cat} photo={i.photo} />
        {!oos ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: -4,
              bottom: -2,
              minWidth: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: qty ? tokens.color.cta : tokens.color.bg,
              borderWidth: qty ? 0 : 1,
              borderColor: tokens.color.line,
              ...tokens.shadow.card,
            }}
          >
            {qty ? (
              <Text style={{ fontSize: 15, fontWeight: "800", color: tokens.color.onAccent, fontVariant: ["tabular-nums"] }}>{qty}</Text>
            ) : (
              <Icon name="plus" size={19} color={tokens.color.accentText} />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
