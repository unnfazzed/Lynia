// GENERATED — do not edit by hand. Structural-parity source of truth for RC.menu#cover.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: menu :: region cover
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.menu#cover
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/[id].tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Tappable, Icon, CoverPhoto, ShopLogo } from "../../src/ui";

export type MenuCoverViewProps = {
  name: string;
  /** Cover image URI, or `false` for the kit's tinted-name fallback (honest-empty). */
  photo: string | false;
  /** Logo image URI, or `false` for the kit's accent-initial fallback (honest-empty). */
  logoPhoto: string | false;
  onBack: () => void;
};

export function MenuCoverView({
  name,
  photo,
  logoPhoto,
  onBack
}: MenuCoverViewProps): React.ReactElement {
  return <CoverPhoto height={92} name={name} photo={photo}>
        <Tappable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={{
      position: "absolute",
      top: 0,
      left: 0
    }}><View style={{
        position: "absolute",
        left: 12,
        top: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        ...tokens.shadow.card
      }}>
          <Icon name="chevron-right" size={18} color={tokens.color.ink} style={{
          transform: [{
            rotate: "180deg"
          }]
        }} />
        </View></Tappable>
        <View style={{
      position: "absolute",
      right: 12,
      top: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: tokens.color.bg,
      alignItems: "center",
      justifyContent: "center",
      ...tokens.shadow.card
    }}>
          <Icon name="search" size={17} color={tokens.color.ink} />
        </View>
        <ShopLogo size={52} style={{
      position: "absolute",
      left: 14,
      bottom: -22
    }} name={name} photo={logoPhoto} />
      </CoverPhoto>;
}
