import { Image as ExpoImage } from "expo-image";
import React from "react";
import type { ImageStyle, StyleProp } from "react-native";

/**
 * The one remote-photo component (deferred-item D5, RCA 2026-08-17 §5.1 follow-through — ranked
 * backlog #3 in docs/PERFORMANCE.md since wave 1, unlocked now that the API serves byte-stable
 * signed URLs): a thin seam over `expo-image` with the exact prop surface the app's RN `Image`
 * call sites already used, so adopting disk caching was an import swap, not eight rewrites.
 *
 * Why expo-image and why now: RN's `Image` on Android gives a memory cache and an HTTP cache that
 * V4-signed URLs used to defeat; `expo-image`'s `memory-disk` policy persists decoded-source bytes
 * across LAUNCHES, downsamples to the rendered size (a 1280 px upload decoded for a 34 px logo tile
 * stops costing a 1280 px bitmap), and recycles views in lists. With URLs now stable for 14 h server
 * side and 24 h of signed validity, the second open of /food costs zero photo bytes.
 *
 * The seam deliberately narrows the API to what the app actually uses — `source={{ uri }}`, style,
 * a no-args-compatible `onError`, `resizeMode` (mapped to `contentFit`; both default "cover"), the
 * accessibility passthroughs, and `recyclingKey` for FlatList rows. Anything new goes through here,
 * so a future image-library change stays a one-file event. NATIVE dependency: ships with the next
 * EAS build (fingerprint shifts); until that build installs, this code path simply isn't on any phone.
 */
export function RemoteImage(props: {
  source: { uri: string };
  style?: StyleProp<ImageStyle>;
  /** Fired on any load failure — same "flip to the fallback tile" contract as RN Image's onError. */
  onError?: () => void;
  /** RN vocabulary, mapped onto expo-image's contentFit. Defaults to "cover" in both worlds. */
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: "auto" | "yes" | "no" | "no-hide-descendants";
  accessible?: boolean;
  accessibilityLabel?: string;
  /** Stable per-row identity for virtualized lists — lets expo-image recycle the native view. */
  recyclingKey?: string;
}): React.ReactElement {
  // expo-image has no "center"; "none" (natural size, centered) is its closest equivalent.
  const contentFit =
    props.resizeMode === "stretch" ? "fill" : props.resizeMode === "center" ? "none" : (props.resizeMode ?? "cover");
  return (
    <ExpoImage
      source={{ uri: props.source.uri }}
      style={props.style as never}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={props.recyclingKey}
      onError={props.onError ? () => props.onError?.() : undefined}
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      importantForAccessibility={props.importantForAccessibility}
      accessible={props.accessible}
      accessibilityLabel={props.accessibilityLabel}
    />
  );
}
