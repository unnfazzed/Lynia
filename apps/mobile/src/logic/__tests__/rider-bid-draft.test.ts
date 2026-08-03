import {
  buildSentOfferEntry,
  isRiderBidDraftExpired,
  isSentOfferExpired,
  isSentOfferStale,
  parseRiderBidDraft,
  parseRiderSentOffers,
  SENT_OFFER_RETENTION_MS,
} from "../rider-bid-draft";

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

// BH-21: unlike the single compose draft above, the LIST of offers a rider has already sent this
// session (bidIds/sentOffers) used to live only in useState — a process death mid-auction wiped it
// with no server-side reconstruction path, so already-bid orders silently reappeared as freshly
// biddable on relaunch. parseRiderSentOffers/isSentOfferExpired are the pure hydrate/expiry gates
// the restore effect uses so this is unit-testable without mounting the rider board screen.
describe("parseRiderSentOffers (BH-21: sent-offer list must survive a process death)", () => {
  const sentA = { order: validSelected, fare: "2.50", etaMinutes: 8, expiresAt: "2026-07-12T00:01:30.000Z" };

  it("returns an empty list when there's nothing stored", () => {
    expect(parseRiderSentOffers(null)).toEqual([]);
    expect(parseRiderSentOffers(undefined)).toEqual([]);
    expect(parseRiderSentOffers("")).toEqual([]);
  });

  it("round-trips a well-formed list", () => {
    expect(parseRiderSentOffers(JSON.stringify([sentA]))).toEqual([sentA]);
  });

  it("survives malformed JSON without throwing", () => {
    expect(parseRiderSentOffers("{not json")).toEqual([]);
  });

  it("drops entries missing an order id or expiresAt rather than crashing the whole restore", () => {
    const malformed = { order: { pickup: {} }, fare: "2.50" };
    expect(parseRiderSentOffers(JSON.stringify([sentA, malformed]))).toEqual([sentA]);
  });

  it("rejects a non-array payload", () => {
    expect(parseRiderSentOffers(JSON.stringify({ sentA }))).toEqual([]);
  });
});

describe("isSentOfferExpired (BH-21: a restored sent-offer whose window already closed must be dropped)", () => {
  const closesAt = new Date(validSelected.createdAt).getTime() + 90_000; // OFFER_WINDOW_MS
  const offer = buildSentOfferEntry(validSelected, "2.50", 8);

  it("is not expired while the auction window is still open", () => {
    expect(isSentOfferExpired(offer, closesAt - 1)).toBe(false);
  });

  it("is expired the instant the window closes", () => {
    expect(isSentOfferExpired(offer, closesAt)).toBe(true);
  });

  it("is expired well after the window closed (the app-killed-mid-auction repro)", () => {
    expect(isSentOfferExpired(offer, closesAt + 60_000)).toBe(true);
  });

  it("treats an unparseable expiresAt as expired rather than trusting it", () => {
    const bad = { ...offer, expiresAt: "not-a-date" };
    expect(isSentOfferExpired(bad, Date.now())).toBe(true);
  });
});

// B-T3: `sentOffers` used to have exactly one removal path (a full wipe on going offline) — a
// taken/expired resolution only flipped the card's own display state, so a busy-market rider who
// stayed online for a long shift accumulated one permanent "Your offers" card per bid, forever, plus
// a growing per-write SecureStore payload (saveRiderSentOffers persists the whole list on every
// change). isSentOfferStale is the pure gate the periodic sweep in rider/(tabs)/index.tsx uses to
// evict resolved offers instead — this pins the bound so the eviction rule can't silently regress
// back to "never".
describe("isSentOfferStale (B-T3: resolved sent-offers must not accumulate for the whole online shift)", () => {
  const closesAt = new Date(validSelected.createdAt).getTime() + 90_000; // OFFER_WINDOW_MS
  const offer = buildSentOfferEntry(validSelected, "2.50", 8);

  it("is not stale while the auction is still open", () => {
    expect(isSentOfferStale(offer, closesAt - 1)).toBe(false);
  });

  it("is not stale immediately after the auction closes — the resolution message must still be visible", () => {
    expect(isSentOfferStale(offer, closesAt)).toBe(false);
    expect(isSentOfferStale(offer, closesAt + SENT_OFFER_RETENTION_MS - 1)).toBe(false);
  });

  it("is stale once the retention window has fully elapsed", () => {
    expect(isSentOfferStale(offer, closesAt + SENT_OFFER_RETENTION_MS)).toBe(true);
  });

  it("is stale well after the retention window — the unbounded-growth repro this run fixed", () => {
    // Before this fix, an offer resolved hours into a shift stayed in `sentOffers` for the rest of
    // the online session; the sweep must be able to evict something that's been stale a long time.
    expect(isSentOfferStale(offer, closesAt + 6 * 60 * 60 * 1000)).toBe(true);
  });

  it("treats an unparseable expiresAt as stale rather than trusting it", () => {
    const bad = { ...offer, expiresAt: "not-a-date" };
    expect(isSentOfferStale(bad, Date.now())).toBe(true);
  });
});
