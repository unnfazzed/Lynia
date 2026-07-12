import { auctionHeaderText } from "../order-labels";

describe("auctionHeaderText (JOURNEY-BUGS: auction clock stuck at 'Finding riders…' at 0:00)", () => {
  it("shows a transitional 'wrapping up' line the instant the clock hits zero, even mid-bidding", () => {
    expect(auctionHeaderText({ remainingMs: 0, bidCount: 3, noRiders: false, reconnecting: false })).toBe(
      "Window closing — wrapping up…",
    );
  });

  it("shows the bid count while the window is still open", () => {
    expect(auctionHeaderText({ remainingMs: 30_000, bidCount: 1, noRiders: false, reconnecting: false })).toBe("1 rider bidding");
    expect(auctionHeaderText({ remainingMs: 30_000, bidCount: 2, noRiders: false, reconnecting: false })).toBe("2 riders bidding");
  });

  it("shows the no-riders state when there's no bid yet and no one nearby", () => {
    expect(auctionHeaderText({ remainingMs: 30_000, bidCount: 0, noRiders: true, reconnecting: false })).toBe(
      "No riders online nearby right now",
    );
  });

  it("falls back to 'Finding riders…' with no bids and riders possibly nearby", () => {
    expect(auctionHeaderText({ remainingMs: 30_000, bidCount: 0, noRiders: false, reconnecting: false })).toBe("Finding riders near you…");
  });

  it("appends a reconnecting hint without masking the zero-clock transitional state", () => {
    expect(auctionHeaderText({ remainingMs: 0, bidCount: 0, noRiders: false, reconnecting: true })).toBe("Window closing — wrapping up…");
    expect(auctionHeaderText({ remainingMs: 30_000, bidCount: 1, noRiders: false, reconnecting: true })).toBe("1 rider bidding · reconnecting…");
  });
});
