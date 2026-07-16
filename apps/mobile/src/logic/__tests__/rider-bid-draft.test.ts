import { buildSentOfferEntry, isRiderBidDraftExpired, parseRiderBidDraft } from "../rider-bid-draft";

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

// BH-05: a rider can edit the fare/eta fields between a failed send and the "already responded"
// 409 lost-response recovery — recordSentOffer used to re-read LIVE form state at that later point,
// showing a just-edited, never-sent price as the rider's own bid. buildSentOfferEntry takes the sent
// values as explicit params so this can't regress.
describe("buildSentOfferEntry (BH-05: sent-offer card must reflect what was actually SENT)", () => {
  it("uses the given fare/eta, not any other value", () => {
    const entry = buildSentOfferEntry(validSelected, "10", 8);
    expect(entry.order).toBe(validSelected);
    expect(entry.fare).toBe("10");
    expect(entry.etaMinutes).toBe(8);
  });

  it("rounds a fractional eta minutes", () => {
    expect(buildSentOfferEntry(validSelected, "10", 7.6).etaMinutes).toBe(8);
  });

  it("computes the auction close as createdAt + OFFER_WINDOW_MS (90s), independent of the sent fare/eta", () => {
    const entry = buildSentOfferEntry(validSelected, "10", 8);
    expect(entry.expiresAt).toBe(new Date(new Date(validSelected.createdAt).getTime() + 90_000).toISOString());
  });

  it("reflects the FIRST attempt's price even if the caller later has a different value in scope — the field itself is the regression guard", () => {
    // Simulates: rider sent $10, form later shows an edited $12 that was never actually sent.
    const sentAtFirstAttempt = buildSentOfferEntry(validSelected, "10", 8);
    const editedButNeverSent = "12";
    expect(sentAtFirstAttempt.fare).toBe("10");
    expect(sentAtFirstAttempt.fare).not.toBe(editedButNeverSent);
  });
});

// Bug hunt 2026-07-16: a restored draft's `selected` order used to be rehydrated on cold start with
// no check against its own 90s auction window (createdAt + OFFER_WINDOW_MS) — only a LIVE bid:expired/
// order:taken WS event ever cleared a dead `selected`, which a cold-started or still-offline app never
// receives. isRiderBidDraftExpired is the pure gate that lets the load effect drop a stale draft instead.
describe("isRiderBidDraftExpired (bug hunt 2026-07-16: cold-start restore must respect the auction window)", () => {
  const draft = { selected: validSelected, fare: "2.50", eta: "10", offerMode: "accept" as const };
  const closesAt = new Date(validSelected.createdAt).getTime() + 90_000; // OFFER_WINDOW_MS

  it("is not expired while the auction window is still open", () => {
    expect(isRiderBidDraftExpired(draft, closesAt - 1)).toBe(false);
  });

  it("is expired the instant the window closes", () => {
    expect(isRiderBidDraftExpired(draft, closesAt)).toBe(true);
  });

  it("is expired well after the window closed (the app-killed-mid-auction repro)", () => {
    expect(isRiderBidDraftExpired(draft, closesAt + 60_000)).toBe(true);
  });

  it("treats an unparseable createdAt as expired rather than trusting it", () => {
    const bad = { ...draft, selected: { ...validSelected, createdAt: "not-a-date" } };
    expect(isRiderBidDraftExpired(bad, Date.now())).toBe(true);
  });
});
