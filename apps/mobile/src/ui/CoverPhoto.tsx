import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";

/**
 * Restaurant cover band — the RN port of the design kit's `CoverPhoto` (r-parts.jsx :: CoverPhoto). A
 * 3:1 strip the merchant uploads, with the shop logo overlaid on its bottom-left corner (passed as
 * `children`, positioned by the caller). The container is `position:relative` so the overlay anchors
 * to it.
 *
 * This is a codegen TARGET primitive: the transpiler emits `<CoverPhoto height=… name=… photo=…
 * label=…>…</CoverPhoto>` verbatim, so the prop shape mirrors the kit exactly.
 *
 * Fidelity note — the kit's `photo` state is a DESIGN-TOOL PLACEHOLDER: `photo={true}` draws a grey
 * band bearing the monospace dimension string ("cover banner · 1200×400"), not a real image, because
 * the mock has no asset to load. The app cannot faithfully ship that placeholder text as a real
 * screen, so `photo` is widened to accept a real image URI: a string renders the actual `Image`
 * (what the placeholder stood in for); `photo={false}` renders the kit's exact photoless fallback (a
 * tinted band with the shop name, accent-text at 45% opacity); a bare `photo` boolean with no source
 * falls back to that same photoless band rather than draw placeholder chrome the user would never see.
 */
export function CoverPhoto({
  height = 96,
  name = "",
  photo = true,
  label = "cover banner · 1200×400",
  children,
}: {
  height?: number;
  name?: string;
  /** A real image URI renders the photo; `false` (or a bare boolean with no URI) renders the tinted
   *  name fallback — the kit's `photo={false}` state. */
  photo?: boolean | string;
  /** Kept for prop-shape parity with the kit; unused once a real image or the fallback renders. */
  label?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const uri = typeof photo === "string" && photo.length > 0 ? photo : null;
  const showPhoto = !!uri && !failed;
  return (
    <View style={{ position: "relative" }}>
      {showPhoto ? (
        <Image
          source={{ uri: uri! }}
          onError={() => setFailed(true)}
          accessibilityLabel={label}
          style={{ height, width: "100%", backgroundColor: tokens.color.surface }}
        />
      ) : (
        // Kit photoless band: accent-wash fill with the shop name set large, at 45% opacity.
        <View style={{ height, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: tokens.color.accentText, opacity: 0.45 }}>{name}</Text>
        </View>
      )}
      {children}
    </View>
  );
}
