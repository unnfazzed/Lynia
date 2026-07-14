import { parsePickupChecklistDraft } from "../pickup-checklist-draft";

describe("parsePickupChecklistDraft (rider pickup-verification ticks had no persistence)", () => {
  it("returns null when there's nothing stored", () => {
    expect(parsePickupChecklistDraft(null)).toBeNull();
    expect(parsePickupChecklistDraft(undefined)).toBeNull();
    expect(parsePickupChecklistDraft("")).toBeNull();
  });

  it("round-trips a well-formed draft", () => {
    const raw = JSON.stringify({ orderId: "order-1", checkedIndexes: [0, 2] });
    expect(parsePickupChecklistDraft(raw)).toEqual({ orderId: "order-1", checkedIndexes: [0, 2] });
  });

  it("rejects a draft with no usable orderId (nothing to restore)", () => {
    expect(parsePickupChecklistDraft(JSON.stringify({ checkedIndexes: [0, 1] }))).toBeNull();
    expect(parsePickupChecklistDraft(JSON.stringify({ orderId: "", checkedIndexes: [0] }))).toBeNull();
    expect(parsePickupChecklistDraft(JSON.stringify(null))).toBeNull();
  });

  it("survives malformed JSON without throwing", () => {
    expect(parsePickupChecklistDraft("{not json")).toBeNull();
  });

  it("defaults a missing/malformed checkedIndexes to an empty (all-unticked) set rather than dropping the whole draft", () => {
    expect(parsePickupChecklistDraft(JSON.stringify({ orderId: "order-1" }))).toEqual({
      orderId: "order-1",
      checkedIndexes: [],
    });
  });

  it("filters out non-integer / negative junk instead of trusting on-device JSON verbatim", () => {
    const raw = JSON.stringify({ orderId: "order-1", checkedIndexes: [0, "1", -1, 2.5, 3, null] });
    expect(parsePickupChecklistDraft(raw)).toEqual({ orderId: "order-1", checkedIndexes: [0, 3] });
  });
});
