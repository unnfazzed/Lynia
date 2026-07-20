import React, { useRef } from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { AuctionClock, URGENT_MS } from "../AuctionClock";

/**
 * PERF20-02 regression pins. The countdown was a screen-level 1s state that re-rendered the whole
 * ~1200-line order screen every second of every auction; it now lives inside <AuctionClock/>. These
 * tests pin (a) the isolation — a ticking clock must NOT re-render its parent — and (b) the exact
 * threshold semantics the screen used to own: fired-once SR announcements, the zero-crossing refetch
 * nudge, the last-20s urgent signal, and the frozen (reconnecting) hold.
 */

jest.useFakeTimers();

const noop = (): void => {};

/** Every rendered tree is unmounted after its test — a still-mounted clock from an earlier test
 *  would keep ticking through later tests' timer advances and pollute their spies. */
const mounted: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  mounted.push(tree);
  return tree;
}

const tick = (ms: number): void => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

/** All Text content of the tree, flattened — the clock string lives somewhere in here. */
function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode)).join("");
}

describe("AuctionClock (PERF20-02)", () => {
  it("ticks its own clock without re-rendering the parent — the extraction's entire point", () => {
    const parentRenders = { count: 0 };
    function Probe(): React.ReactElement {
      parentRenders.count += 1;
      const expiresAt = useRef(new Date(Date.now() + 90_000).toISOString()).current;
      return (
        <AuctionClock
          expiresAt={expiresAt}
          frozen={false}
          reduceMotion
          reconnecting={false}
          bidCount={0}
          noRiders={false}
          onUrgentChange={noop}
          onZero={noop}
        />
      );
    }
    const tree = render(<Probe />);
    const before = parentRenders.count;
    const clockBefore = textOf(tree);
    tick(5_000); // five 1s ticks
    expect(textOf(tree)).not.toBe(clockBefore); // the clock itself advanced…
    expect(parentRenders.count).toBe(before); // …and the parent never re-rendered
  });

  it("fires onZero exactly once at 0:00 (the JOURNEY-BUGS refetch nudge)", () => {
    const onZero = jest.fn();
    render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 2_000).toISOString()}
        frozen={false}
        reduceMotion
        reconnecting={false}
        bidCount={0}
        noRiders={false}
        onUrgentChange={noop}
        onZero={onZero}
      />,
    );
    tick(5_000); // well past zero — the clamped clock keeps ticking at 0
    expect(onZero).toHaveBeenCalledTimes(1);
  });

  it("signals urgent=true once entering the last 20s, and urgent=false on unmount", () => {
    const onUrgentChange = jest.fn();
    const tree = render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 25_000).toISOString()}
        frozen={false}
        reduceMotion
        reconnecting={false}
        bidCount={2}
        noRiders={false}
        onUrgentChange={onUrgentChange}
        onZero={noop}
      />,
    );
    expect(onUrgentChange).toHaveBeenLastCalledWith(false); // mount: 25s left, calm
    tick(6_000); // 19s left — inside URGENT_MS
    expect(onUrgentChange).toHaveBeenLastCalledWith(true);
    expect(URGENT_MS).toBe(20_000); // the affordance window is a product decision — pin it
    act(() => tree.unmount());
    expect(onUrgentChange).toHaveBeenLastCalledWith(false); // never outlives the auction that armed it
  });

  it("announces each SR threshold once (60s / 30s / closing), never per-second spam", () => {
    const announce = jest.fn();
    render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 65_000).toISOString()}
        frozen={false}
        reduceMotion
        reconnecting={false}
        bidCount={0}
        noRiders={false}
        onUrgentChange={noop}
        onZero={noop}
        announce={announce}
      />,
    );
    tick(70_000);
    expect(announce.mock.calls.map((c) => c[0])).toEqual([
      "Offer window: 1 minute left",
      "Offer window: 30 seconds left",
      "Offer window closing",
    ]);
  });

  it("frozen holds the last value (reconnecting — wall-clock drift can't be trusted)", () => {
    const tree = render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 90_000).toISOString()}
        frozen
        reduceMotion
        reconnecting
        bidCount={0}
        noRiders={false}
        onUrgentChange={noop}
        onZero={noop}
      />,
    );
    const held = textOf(tree);
    tick(10_000);
    expect(textOf(tree)).toBe(held); // no interval while frozen; the paused dot stays
    expect(held).toContain("·");
  });
});
