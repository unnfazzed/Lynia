/**
 * A photo that failed to load must be tried again when its URL changes. Venue lists are restored from
 * the on-device cache for up to a week, but their signed photo URLs expire after 24 h: a cold start drew
 * the expired URL, it failed, and Home's "Popular shops" card stayed on its letter tile even after the
 * refetch brought a fresh URL (owner report 2026-11-08, Uptown Liquor showing "U").
 */
import renderer, { act } from "react-test-renderer";
import { Image as ExpoImage } from "expo-image";
import { VenueCard } from "../home/kit";
import { VenueImage } from "../browse/kit";

const EXPIRED = "https://signed.example/banner/m1/cover.jpg?X-Goog-Expires=old";
const FRESH = "https://signed.example/banner/m1/cover.jpg?X-Goog-Expires=new";
const noop = (): void => undefined;

function imagesOf(tree: renderer.ReactTestRenderer): Array<{ uri: string; onError?: () => void }> {
  return tree.root
    .findAllByType(ExpoImage as unknown as React.ElementType)
    .map((n) => ({ uri: (n.props.source as { uri: string }).uri, onError: n.props.onError as (() => void) | undefined }));
}

describe("a failed photo is retried when its URL changes", () => {
  it("Home's VenueCard draws the fresh cover after the expired one failed", () => {
    const card = (url: string): React.ReactElement => (
      <VenueCard name="Uptown Liquor" photoUrl={url} kind="Other" rating={null} etaMinutes={37} deliveryFee="$2–3" onPress={noop} />
    );
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(card(EXPIRED));
    });
    act(() => imagesOf(tree)[0]!.onError!());
    expect(imagesOf(tree)).toHaveLength(0); // the letter tile
    act(() => tree.update(card(FRESH)));
    expect(imagesOf(tree).map((i) => i.uri)).toEqual([FRESH]);
    act(() => tree.unmount());
  });

  it("the browse VenueImage does the same", () => {
    const img = (url: string): React.ReactElement => <VenueImage photoUrl={url} name="Uptown Liquor" kind={null} style={{ width: 48, height: 48 }} />;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(img(EXPIRED));
    });
    act(() => imagesOf(tree)[0]!.onError!());
    expect(imagesOf(tree)).toHaveLength(0);
    act(() => tree.update(img(FRESH)));
    expect(imagesOf(tree).map((i) => i.uri)).toEqual([FRESH]);
    act(() => tree.unmount());
  });
});
