// react-native-web ships no `Libraries/Image/resolveAssetSource` — that path is React Native's NATIVE
// asset registry, so the "react-native" → "react-native-web" alias rewrites expo-image's import onto
// a file that does not exist and esbuild dies "Could not resolve". expo-image's own module is a bare
// re-export of it (expo-image/src/utils/resolveAssetSource.tsx), used to turn a source into
// `{ uri, width, height }`.
//
// A parity render has no native asset bundle: sources arrive as a URL string or an already-shaped
// `{ uri }` object, so pass those straight through. A NUMBER is a native bundler asset id that the
// web build genuinely cannot resolve — answer null so expo-image renders nothing rather than a
// broken <img> pointing at an integer.
export default function resolveAssetSource(source) {
  if (source == null) return null;
  if (typeof source === "string") return { uri: source };
  if (typeof source === "number") return null;
  return source;
}
