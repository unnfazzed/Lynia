// Web shim for expo-image. The real package is a NATIVE module — it reaches for expo's `SharedRef`
// global the moment it loads, which does not exist in a browser render ("Cannot read properties of
// undefined (reading 'SharedRef')"), so it cannot be bundled for the parity lane at all.
//
// The app touches expo-image through exactly one seam (`src/ui/RemoteImage.tsx`), and that seam
// already narrows the API to `source={{ uri }}` + style + contentFit + a no-args onError + the
// accessibility passthroughs. So the shim only has to answer that surface, mapping expo's vocabulary
// back onto react-native-web's Image:
//   · contentFit → resizeMode ("fill" → "stretch", "none" → "center", else as-is)
//   · cachePolicy / recyclingKey → dropped (a single render has no cache and no view recycling)
import * as React from "react";
import { Image as RNWImage } from "react-native";

const FIT_TO_RESIZE_MODE = { fill: "stretch", none: "center", cover: "cover", contain: "contain" };

export function Image({ source, style, contentFit, cachePolicy, recyclingKey, placeholder, transition, ...rest }) {
  return React.createElement(RNWImage, {
    source,
    style,
    resizeMode: FIT_TO_RESIZE_MODE[contentFit] ?? "cover",
    ...rest,
  });
}

export const ImageBackground = Image;
export default { Image, ImageBackground };
