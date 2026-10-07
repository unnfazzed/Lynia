import { Image as ExpoImage } from "expo-image";
import React, { useState } from "react";
import type { ImageStyle, StyleProp } from "react-native";

/**
 * P16: the device image-cache key for a remote photo — the URL WITHOUT its query string (and
 * fragment). A signed URL's query carries the signature, its date and expiry, which change at least
 * every ~14 h (the API's cache window) and per API instance, so keying on the full URL re-downloaded
 * the same photo every day. The path still holds the host, the bucket/container and the object key
 * (`dish/<id>/<uuid>.jpg`, `pickup/<riderId>/<uuid>.jpg`…), so two different objects never share a
 * key, and a replaced photo (always a new uuid key) never shows the old bytes. Only http(s) URLs with
 * a query are rewritten; local captures (`file://`), data URIs and plain URLs keep the default key
 * (the uri itself).
 */
export function imageCacheKey(uri: string): string | undefined {
  if (!/^https?:\/\//i.test(uri)) return undefined;
  const cut = uri.search(/[?#]/);
  return cut === -1 ? undefined : uri.slice(0, cut);
}

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
 *
 * P16: the device cache is keyed by {@link imageCacheKey} (the URL minus its signature query), not
 * the full signed URL, so a re-signed URL for the same object still hits the disk cache.
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
  /** Default "memory-disk" fits the public catalog imagery this seam mostly serves. PRIVATE
   *  imagery (e.g. proof-of-pickup photos) must pass "memory" so its bytes never persist to the
   *  on-device disk cache. */
  cachePolicy?: "memory" | "memory-disk";
  /** P11 (D7): expo-image's load priority; 'low' queues an off-screen row behind what the customer can
   *  see (on web it becomes the `<img>`'s fetchpriority). Default "normal". */
  priority?: "low" | "normal" | "high";
  /** D7 review: tried once when `source` fails (a thumbnail that is recorded but missing falls back to
   *  the full photo); only if that fails too does `onError` fire. */
  fallbackUri?: string | null;
}): React.ReactElement {
  // Which source failed: a new `source` starts over from the primary.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const primary = props.source.uri;
  const fallback = props.fallbackUri && props.fallbackUri !== primary ? props.fallbackUri : null;
  const uri = failedUri === primary && fallback ? fallback : primary;
  const onError = (): void => {
    if (uri === primary && fallback) setFailedUri(primary);
    else props.onError?.();
  };
  // expo-image has no "center"; "none" (natural size, centered) is its closest equivalent.
  const contentFit =
    props.resizeMode === "stretch" ? "fill" : props.resizeMode === "center" ? "none" : (props.resizeMode ?? "cover");
  return (
    <ExpoImage
      source={{ uri, cacheKey: imageCacheKey(uri) }}
      style={props.style as never}
      contentFit={contentFit}
      cachePolicy={props.cachePolicy ?? "memory-disk"}
      recyclingKey={props.recyclingKey}
      priority={props.priority ?? "normal"}
      onError={props.onError || fallback ? onError : undefined}
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      importantForAccessibility={props.importantForAccessibility}
      accessible={props.accessible}
      accessibilityLabel={props.accessibilityLabel}
    />
  );
}
