/**
 * PickupPhoto null-hiding contract (§5c proof-of-pickup): the tracker mounts this unconditionally
 * with the snapshot's `pickupPhotoUrl`, so it MUST render nothing for photo-less pickups, old
 * orders, and an older API (field absent) — and the actual image only when a URL arrives.
 */
import renderer, { act } from "react-test-renderer";

import { PickupPhoto } from "../PickupPhoto";

describe("PickupPhoto", () => {
  it("renders nothing without a URL — absent field (old API), null (no photo attached)", () => {
    for (const url of [undefined, null]) {
      let tree!: renderer.ReactTestRenderer;
      act(() => { tree = renderer.create(<PickupPhoto url={url} />); });
      expect(tree.toJSON()).toBeNull();
    }
  });

  it("renders the labelled card image from the signed URL once a photo is attached", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<PickupPhoto url="https://signed.example/pickup/r1/p.jpg" />); });
    const image = tree.root.findAll((n) => n.props.accessibilityLabel === "Photo of your parcel, taken by the rider at pickup")[0];
    expect(image).toBeTruthy();
    expect(image!.props.source).toEqual({ uri: "https://signed.example/pickup/r1/p.jpg" });
    // The trust copy the design specs: the customer is told whose photo this is.
    expect(JSON.stringify(tree.toJSON())).toContain("Parcel photo from your rider");
  });
});
