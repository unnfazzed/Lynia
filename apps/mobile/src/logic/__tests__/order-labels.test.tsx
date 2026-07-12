import { auctionHeaderText, isRiderTrackingStale } from "../order-labels";

const NOW = new Date("2026-07-12T00:10:00.000Z").getTime();
const ESCALATION_MS = 90_000;

describe("isRiderTrackingStale (JOURNEY-BUGS: rider never fixes → tracker frozen forever)", () => {
  it("is never stale while the order isn't active", () => {
    expect(
      isRiderTrackingStale({ isActive: false, riderUpdatedAt: null, assignedAt: "2026-07-12T00:00:00.000Z", nowMs: NOW, escalationMs: ESCALATION_MS }),
    ).toBe(false);
  });

  it("escalates once a real fix goes stale past the escalation window", () => {
    expect(
      isRiderTrackingStale({ isActive: true, riderUpdatedAt: "2026-07-12T00:08:00.000Z", assignedAt: null, nowMs: NOW, escalationMs: ESCALATION_MS }),
    ).toBe(true); // 120s old, past the 90s escalation window
  });

  it("is not stale with a fresh fix", () => {
    expect(
      isRiderTrackingStale({ isActive: true, riderUpdatedAt: "2026-07-12T00:09:30.000Z", assignedAt: null, nowMs: NOW, escalationMs: ESCALATION_MS }),
    ).toBe(false);
  });

  it("escalates when NO fix has EVER arrived and assignment is old (the frozen-forever bug)", () => {
    expect(
      isRiderTrackingStale({ isActive: true, riderUpdatedAt: null, assignedAt: "2026-07-12T00:07:00.000Z", nowMs: NOW, escalationMs: ESCALATION_MS }),
    ).toBe(true);
  });

  it("does not prematurely escalate a never-fixed rider still within the grace window", () => {
    expect(
      isRiderTrackingStale({ isActive: true, riderUpdatedAt: null, assignedAt: "2026-07-12T00:09:30.000Z", nowMs: NOW, escalationMs: ESCALATION_MS }),
    ).toBe(false);
  });

  it("stays calm with no fix and no assignment timestamp to anchor off (old client / missing data)", () => {
    expect(isRiderTrackingStale({ isActive: true, riderUpdatedAt: null, assignedAt: null, nowMs: NOW, escalationMs: ESCALATION_MS })).toBe(false);
  });
});

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
