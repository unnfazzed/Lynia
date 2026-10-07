import { Image as ExpoImage } from "expo-image";
import { imageCacheKey, RemoteImage } from "../RemoteImage";
import { renderSync } from "../../testing/render-sync";

// P16: the device image cache was keyed by the full signed URL, whose query (signature, date,
// expiry) changes at least every ~14 h and per API instance — so the same photo downloaded again
// every day. RemoteImage now hands expo-image a stable cacheKey: the URL without its query string.

const SIGNED_A =
  "https://storage.googleapis.com/lynia-media/dish/m-1/0b4f.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20261007T120000Z&X-Goog-Expires=86400&X-Goog-Signature=abc";
const SIGNED_A_LATER =
  "https://storage.googleapis.com/lynia-media/dish/m-1/0b4f.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20261008T020000Z&X-Goog-Expires=86400&X-Goog-Signature=def";
const SIGNED_B = "https://storage.googleapis.com/lynia-media/dish/m-1/9c21.jpg?X-Goog-Signature=abc";

function sourceOf(uri: string): { uri: string; cacheKey?: string } {
  const tree = renderSync(<RemoteImage source={{ uri }} />);
  return tree.root.findByType(ExpoImage as never).props.source as { uri: string; cacheKey?: string };
}

describe("RemoteImage cache key (P16)", () => {
  it("passes a query-less cacheKey and still loads the full signed URL", () => {
    const src = sourceOf(SIGNED_A);
    expect(src.uri).toBe(SIGNED_A);
    expect(src.cacheKey).toBe("https://storage.googleapis.com/lynia-media/dish/m-1/0b4f.jpg");
    expect(src.cacheKey).not.toContain("?");
  });

  it("a re-signed URL for the same object keeps the same key; a different object gets a different key", () => {
    expect(sourceOf(SIGNED_A_LATER).cacheKey).toBe(sourceOf(SIGNED_A).cacheKey);
    expect(sourceOf(SIGNED_B).cacheKey).not.toBe(sourceOf(SIGNED_A).cacheKey);
  });

  it("drops a fragment too, and leaves local captures, data URIs and plain URLs on the default key", () => {
    expect(imageCacheKey("https://cdn.example/a.jpg#x")).toBe("https://cdn.example/a.jpg");
    expect(imageCacheKey("https://cdn.example/a.jpg")).toBeUndefined();
    expect(imageCacheKey("file:///data/user/0/cache/photo.jpg")).toBeUndefined();
    expect(imageCacheKey("data:image/png;base64,iVBORw0KGgo=")).toBeUndefined();
  });
});
