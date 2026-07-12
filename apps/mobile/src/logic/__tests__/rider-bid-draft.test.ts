import { parseRiderBidDraft } from "../rider-bid-draft";

const validSelected = {
  id: "order-1",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
  itemDesc: "Documents",
  suggestedFare: "2.40",
  proposedFare: "2.50",
  distanceKm: 1.5,
  createdAt: "2026-07-12T00:00:00.000Z",
};

describe("parseRiderBidDraft (JOURNEY-BUGS: rider bid-compose had no persistence)", () => {
  it("returns null when there's nothing stored", () => {
    expect(parseRiderBidDraft(null)).toBeNull();
    expect(parseRiderBidDraft(undefined)).toBeNull();
    expect(parseRiderBidDraft("")).toBeNull();
  });

  it("round-trips a well-formed draft", () => {
    const raw = JSON.stringify({ selected: validSelected, fare: "3.00", eta: "12", offerMode: "counter" });
    expect(parseRiderBidDraft(raw)).toEqual({ selected: validSelected, fare: "3.00", eta: "12", offerMode: "counter" });
  });

  it("rejects a draft with no usable selected order (nothing to restore)", () => {
    expect(parseRiderBidDraft(JSON.stringify({ fare: "3.00", eta: "12", offerMode: "accept" }))).toBeNull();
    expect(parseRiderBidDraft(JSON.stringify({ selected: {}, fare: "3.00" }))).toBeNull();
    expect(parseRiderBidDraft(JSON.stringify(null))).toBeNull();
  });

  it("survives malformed JSON without throwing", () => {
    expect(parseRiderBidDraft("{not json")).toBeNull();
  });

  it("defaults a missing/malformed fare, eta, or offerMode rather than dropping the whole draft", () => {
    const raw = JSON.stringify({ selected: validSelected, offerMode: "something-unexpected" });
    expect(parseRiderBidDraft(raw)).toEqual({ selected: validSelected, fare: "", eta: "", offerMode: "accept" });
  });
});
