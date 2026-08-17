/**
 * SentOfferCard states + ticker ownership (PERF, deferred 2026-07-10). The 1s auction countdown used
 * to be screen-level state (`nowMs` in rider/index.tsx), re-rendering the whole board every second;
 * it now lives inside each card. Under test: the live countdown renders and advances (clamped at
 * 0:00), the taken/expired resolutions show their exact copy (taken wins when both arrive), and the
 * card schedules exactly one interval while live — torn down the moment the offer resolves.
 */
import renderer, { act } from "react-test-renderer";

import { SentOfferCard } from "../SentOfferCard";

jest.useFakeTimers();

/** Flatten every rendered string so copy/clock assertions don't depend on Text nesting. */
function flatText(node: ReturnType<renderer.ReactTestRenderer["toJSON"]>): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flatText).join("");
  return flatText((node.children ?? []) as ReturnType<renderer.ReactTestRenderer["toJSON"]>);
}

const baseProps = {
  pickupLandmark: "Eastgate",
  dropoffLandmark: "Avenues",
  fare: "4.50",
  etaMinutes: 8,
  expiresAt: "2026-07-12T12:01:30.000Z", // 90s after the frozen clock below
  taken: false,
  expired: false,
};

beforeEach(() => {
  jest.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));
});

describe("SentOfferCard", () => {
  it("renders a live countdown and advances it on its own 1s ticker", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<SentOfferCard {...baseProps} />); });
    expect(flatText(tree.toJSON())).toContain("Customer's window closes in");
    expect(flatText(tree.toJSON())).toContain("1:30");
    act(() => { jest.advanceTimersByTime(1_000); });
    expect(flatText(tree.toJSON())).toContain("1:29");
    // Past the close with no board push yet: clamp at 0:00 — never a negative clock.
    act(() => { jest.advanceTimersByTime(95_000); });
    expect(flatText(tree.toJSON())).toContain("0:00");
  });

  it("shows the 'not chosen' copy when taken, with no countdown", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<SentOfferCard {...baseProps} taken />); });
    const text = flatText(tree.toJSON());
    expect(text).toContain("Not this time — the customer picked another rider.");
    expect(text).not.toContain("Customer's window closes in");
  });

  it("shows the 'window closed' copy when expired, and taken wins if both arrive", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<SentOfferCard {...baseProps} expired />); });
    expect(flatText(tree.toJSON())).toContain("That window closed — the customer's auction ended with nobody picked.");
    // The orderTaken and bidExpired pushes can both land for one order; "someone else was picked"
    // is the truthful resolution and must win (same precedence the screen's inline card had).
    act(() => { tree.update(<SentOfferCard {...baseProps} expired taken />); });
    expect(flatText(tree.toJSON())).toContain("Not this time — the customer picked another rider.");
  });

  it("owns its ticker: one interval while live, torn down the moment the offer resolves", () => {
    const before = jest.getTimerCount();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<SentOfferCard {...baseProps} />); });
    expect(jest.getTimerCount()).toBe(before + 1); // the card's own 1s interval, nothing else
    act(() => { tree.update(<SentOfferCard {...baseProps} taken />); });
    expect(jest.getTimerCount()).toBe(before); // resolved card ticks nothing
  });

  it("never schedules a ticker for a card that mounts already resolved", () => {
    const before = jest.getTimerCount();
    act(() => { renderer.create(<SentOfferCard {...baseProps} expired />); });
    expect(jest.getTimerCount()).toBe(before);
  });
});
