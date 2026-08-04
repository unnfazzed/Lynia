import { parsePickupPhotoDraft } from "../pickup-photo-draft";

describe("parsePickupPhotoDraft (C-O7/LC-C09 — pickup-photo capture/upload had no persistence)", () => {
  it("returns null when there's nothing stored", () => {
    expect(parsePickupPhotoDraft(null)).toBeNull();
    expect(parsePickupPhotoDraft(undefined)).toBeNull();
    expect(parsePickupPhotoDraft("")).toBeNull();
  });

  it("round-trips a well-formed draft", () => {
    const raw = JSON.stringify({ orderId: "order-1", uri: "file://capture.jpg", width: 4000, height: 3000, contentType: "image/jpeg" });
    expect(parsePickupPhotoDraft(raw)).toEqual({
      orderId: "order-1",
      uri: "file://capture.jpg",
      width: 4000,
      height: 3000,
      contentType: "image/jpeg",
    });
  });

  it("round-trips without width/height (unknown dimensions)", () => {
    const raw = JSON.stringify({ orderId: "order-1", uri: "file://capture.jpg", contentType: "image/png" });
    expect(parsePickupPhotoDraft(raw)).toEqual({
      orderId: "order-1",
      uri: "file://capture.jpg",
      width: undefined,
      height: undefined,
      contentType: "image/png",
    });
  });

  it("rejects a draft missing orderId, uri, or a recognized contentType", () => {
    expect(parsePickupPhotoDraft(JSON.stringify({ uri: "file://x.jpg", contentType: "image/jpeg" }))).toBeNull();
    expect(parsePickupPhotoDraft(JSON.stringify({ orderId: "", uri: "file://x.jpg", contentType: "image/jpeg" }))).toBeNull();
    expect(parsePickupPhotoDraft(JSON.stringify({ orderId: "order-1", contentType: "image/jpeg" }))).toBeNull();
    expect(parsePickupPhotoDraft(JSON.stringify({ orderId: "order-1", uri: "file://x.jpg" }))).toBeNull();
    expect(parsePickupPhotoDraft(JSON.stringify({ orderId: "order-1", uri: "file://x.jpg", contentType: "image/gif" }))).toBeNull();
    expect(parsePickupPhotoDraft(JSON.stringify(null))).toBeNull();
  });

  it("survives malformed JSON without throwing", () => {
    expect(parsePickupPhotoDraft("{not json")).toBeNull();
  });

  it("drops junk width/height instead of trusting on-device JSON verbatim", () => {
    const raw = JSON.stringify({ orderId: "order-1", uri: "file://x.jpg", width: "4000", height: null, contentType: "image/jpeg" });
    expect(parsePickupPhotoDraft(raw)).toEqual({
      orderId: "order-1",
      uri: "file://x.jpg",
      width: undefined,
      height: undefined,
      contentType: "image/jpeg",
    });
  });
});
