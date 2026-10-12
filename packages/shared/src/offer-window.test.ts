import { describe, expect, it } from "vitest";
import { OFFER_WINDOW_MS } from "./contracts";
import { OFFER_WINDOW_POLICY, offerWindowEndAfterRaise, offerWindowEndsAt, offerWindowMsForSupply } from "./offer-window";

describe("offerWindowMsForSupply", () => {
  it("opens a longer window when few bikers are online", () => {
    expect(offerWindowMsForSupply(0)).toBe(OFFER_WINDOW_POLICY.quietWindowMs);
    expect(offerWindowMsForSupply(OFFER_WINDOW_POLICY.quietBelowRiders - 1)).toBe(OFFER_WINDOW_POLICY.quietWindowMs);
  });

  it("keeps the normal window once supply is there, and when supply is unknown", () => {
    expect(offerWindowMsForSupply(OFFER_WINDOW_POLICY.quietBelowRiders)).toBe(OFFER_WINDOW_MS);
    expect(offerWindowMsForSupply(50)).toBe(OFFER_WINDOW_MS);
    expect(offerWindowMsForSupply(null)).toBe(OFFER_WINDOW_MS);
  });
});

describe("offerWindowEndsAt", () => {
  const createdAt = new Date("2026-10-12T10:00:00.000Z");

  it("reads the persisted end", () => {
    const end = new Date("2026-10-12T10:04:00.000Z");
    expect(offerWindowEndsAt({ createdAt, offerWindowEndsAt: end }).toISOString()).toBe(end.toISOString());
  });

  it("falls back to createdAt + OFFER_WINDOW_MS for a row without one", () => {
    expect(offerWindowEndsAt({ createdAt, offerWindowEndsAt: null }).getTime()).toBe(createdAt.getTime() + OFFER_WINDOW_MS);
    expect(offerWindowEndsAt({ createdAt: createdAt.toISOString() }).getTime()).toBe(createdAt.getTime() + OFFER_WINDOW_MS);
  });
});

describe("offerWindowEndAfterRaise", () => {
  const createdAt = new Date("2026-10-12T10:00:00.000Z");
  const t = (ms: number) => createdAt.getTime() + ms;

  it("leaves at least a minute on the clock after a late raise", () => {
    const end = new Date(t(90_000));
    expect(offerWindowEndAfterRaise(createdAt, end, t(80_000)).getTime()).toBe(t(80_000 + OFFER_WINDOW_POLICY.raiseMinRemainingMs));
  });

  it("never shortens a window that already has more than a minute left", () => {
    const end = new Date(t(240_000));
    expect(offerWindowEndAfterRaise(createdAt, end, t(30_000)).getTime()).toBe(end.getTime());
  });

  it("never stretches past the cap from creation", () => {
    const end = new Date(t(OFFER_WINDOW_POLICY.maxWindowMs - 10_000));
    expect(offerWindowEndAfterRaise(createdAt, end, t(OFFER_WINDOW_POLICY.maxWindowMs - 20_000)).getTime()).toBe(t(OFFER_WINDOW_POLICY.maxWindowMs));
  });
});
