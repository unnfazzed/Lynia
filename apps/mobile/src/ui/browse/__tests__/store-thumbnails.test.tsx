/**
 * D7 (owner 2026-10-07; P04, P11): catalogue rows, tiles and cards draw the server's small thumbnail
 * (`thumbUrl`) and fall back to the full photo; rows past the first screen and a half load at low
 * priority. The full photo stays for the large views (the item sheet).
 */
import renderer, { act } from "react-test-renderer";
import { Image as ExpoImage } from "expo-image";
import type { RestaurantListItem } from "@lynia/shared";
import { restaurantVenue } from "../../../logic/browse";
import { DishRow, EAGER_PHOTO_ROWS, listPhoto, PharmacyRow, photoPriority, PopularCard, ShopTile, type StoreItem } from "../store";

const FULL = "https://signed.example/dish/a.jpg";
const THUMB = "https://signed.example/dish/a.jpg.thumb.jpg";
const item = (over: Partial<StoreItem> = {}): StoreItem => ({
  id: "d-1",
  name: "Sadza & beef",
  description: null,
  priceUsd: 4.5,
  photoUrl: FULL,
  thumbUrl: THUMB,
  unavailable: false,
  outOfStock: false,
  ...over,
});
const noop = (): void => undefined;

function images(el: React.ReactElement): Array<{ uri: string; priority: string | undefined }> {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  const found = tree.root.findAllByType(ExpoImage as unknown as React.ElementType).map((n) => ({ uri: (n.props.source as { uri: string }).uri, priority: n.props.priority as string | undefined }));
  act(() => tree.unmount());
  return found;
}

describe("catalogue photos prefer the thumbnail (D7)", () => {
  it("every row, tile and card draws thumbUrl", () => {
    expect(images(<DishRow item={item()} qty={0} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />).map((i) => i.uri)).toEqual([THUMB]);
    expect(images(<PharmacyRow item={item()} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />).map((i) => i.uri)).toEqual([THUMB]);
    expect(images(<ShopTile item={item()} onOpen={noop} />).map((i) => i.uri)).toEqual([THUMB]);
    expect(images(<PopularCard item={item()} qty={0} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />).map((i) => i.uri)).toEqual([THUMB]);
  });

  it("falls back to the full photo while the server has no thumbnail", () => {
    expect(listPhoto(item({ thumbUrl: null }))).toBe(FULL);
    expect(listPhoto(item({ thumbUrl: undefined }))).toBe(FULL);
    expect(images(<DishRow item={item({ thumbUrl: undefined })} qty={0} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />).map((i) => i.uri)).toEqual([FULL]);
  });

  it("the venue view takes the cover thumbnail for small tiles and the logo thumbnail for the disc, keeping the full cover", () => {
    const r = {
      id: "m-1",
      name: "Gava",
      coverPhotoUrl: "https://signed.example/cover.jpg",
      coverThumbUrl: "https://signed.example/cover.jpg.thumb.jpg",
      logoUrl: "https://signed.example/logo.jpg",
      logoThumbUrl: "https://signed.example/logo.jpg.thumb.jpg",
      cuisineTags: [],
      priceLevel: null,
      hours: null,
      location: null,
      ratingAvg: null,
      ratingCount: 0,
      prepBaselineMinutes: null,
    } as RestaurantListItem;
    const v = restaurantVenue(r, null, new Date("2026-10-07T10:00:00Z"));
    expect(v).toMatchObject({ photoUrl: r.coverPhotoUrl, thumbUrl: r.coverThumbUrl, logoUrl: r.logoUrl, logoThumbUrl: r.logoThumbUrl });
    const old = restaurantVenue({ ...r, coverThumbUrl: undefined, logoThumbUrl: undefined }, null, new Date());
    expect(old).toMatchObject({ photoUrl: r.coverPhotoUrl, thumbUrl: null, logoUrl: r.logoUrl, logoThumbUrl: null });
  });
});

describe("off-screen catalogue photos load at low priority (P11 first step)", () => {
  it("the first rows are normal, the rest low", () => {
    expect(photoPriority(0)).toBe("normal");
    expect(photoPriority(EAGER_PHOTO_ROWS - 1)).toBe("normal");
    expect(photoPriority(EAGER_PHOTO_ROWS)).toBe("low");
    expect(images(<DishRow item={item()} qty={0} canAdd priority="low" onOpen={noop} onAdd={noop} onMinus={noop} />)[0]!.priority).toBe("low");
    expect(images(<DishRow item={item()} qty={0} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />)[0]!.priority).toBe("normal");
  });
});

describe("a thumbnail that fails to load falls back to the full photo (D7 review)", () => {
  it("tries the full photo once, then the placeholder", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<DishRow item={item()} qty={0} canAdd onOpen={noop} onAdd={noop} onMinus={noop} />);
    });
    const img = () => tree.root.findAllByType(ExpoImage as unknown as React.ElementType);
    expect(img()[0]!.props.source).toEqual({ uri: THUMB });
    act(() => img()[0]!.props.onError());
    expect(img()[0]!.props.source).toEqual({ uri: FULL });
    act(() => img()[0]!.props.onError());
    expect(img()).toHaveLength(0); // the placeholder initial
    expect(tree.root.findByProps({ children: "S" })).toBeTruthy();
    act(() => tree.unmount());
  });
});
