import { noRidersOnline, shouldNoticeTakenOrder, shouldShowJobError, shouldShowOffersError } from "../journey";

describe("shouldShowOffersError (customer auction honesty)", () => {
  // Decision table: only an errored fetch with zero offers, while still open for offers, is honest error.
  it("is an honest error when the offers fetch errored with nothing to show and still open for offers", () => {
    expect(shouldShowOffersError(true, 0, true)).toBe(true);
  });

  it("stays the calm working state when there is no error (genuine no-offers-yet)", () => {
    expect(shouldShowOffersError(false, 0, true)).toBe(false);
  });

  it("never fires while there are offers on screen (WS-streamed / cached bids)", () => {
    // Retained data on an errored refetch still shows bids — don't hijack that with an error state.
    expect(shouldShowOffersError(true, 3, true)).toBe(false);
  });

  it("never fires once the order has left open_for_offers (e.g. optimistic select → assigned)", () => {
    expect(shouldShowOffersError(true, 0, false)).toBe(false);
  });
});

describe("noRidersOnline (customer supply-empty state, 2·b1)", () => {
  it("fires only when open, no bids, and the server reported zero riders nearby", () => {
    expect(noRidersOnline(0, 0, true)).toBe(true);
  });

  it("stays calm ('finding riders') when supply is unknown (null) — a geo blip must not lie", () => {
    expect(noRidersOnline(null, 0, true)).toBe(false);
    expect(noRidersOnline(undefined, 0, true)).toBe(false);
  });

  it("never fires when riders are nearby, or once any bid has landed", () => {
    expect(noRidersOnline(3, 0, true)).toBe(false); // riders present, just no bid yet
    expect(noRidersOnline(0, 1, true)).toBe(false); // a bid overrides the empty state
  });

  it("never fires outside open_for_offers", () => {
    expect(noRidersOnline(0, 0, false)).toBe(false);
  });
});

describe("shouldNoticeTakenOrder (rider board 'order taken first', 2·b1)", () => {
  it("notices an un-bid board order taken by someone else", () => {
    expect(shouldNoticeTakenOrder(true, false)).toBe(true);
  });

  it("stays silent for a bid the rider LOST (its sent-offer card shows 'not chosen' instead)", () => {
    expect(shouldNoticeTakenOrder(true, true)).toBe(false);
  });

  it("stays silent for an order that was never on this rider's board", () => {
    expect(shouldNoticeTakenOrder(false, false)).toBe(false);
  });
});

describe("shouldShowJobError (rider cold-start honesty)", () => {
  // Decision table: isError + no data → error; no-error + no data → calm empty; data present → normal.
  it("is an honest error on a cold-start fetch failure with no data", () => {
    expect(shouldShowJobError(true, false)).toBe(true);
  });

  it("stays the calm no-job empty state when a successful fetch returned no job", () => {
    expect(shouldShowJobError(false, false)).toBe(false);
  });

  it("does not fire when a warm refetch errored but retained the job (data present)", () => {
    expect(shouldShowJobError(true, true)).toBe(false);
  });

  it("does not fire on a normal loaded job", () => {
    expect(shouldShowJobError(false, true)).toBe(false);
  });
});
