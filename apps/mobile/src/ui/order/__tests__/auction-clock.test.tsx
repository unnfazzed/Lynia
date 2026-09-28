import React, { useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { fontFamilies } from "../../fonts";
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
  jest.restoreAllMocks(); // so an Animated.timing spy from one test never leaks calls into the next
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

/** A host `Text` node: what every Text renders down to, the Inter-patched export and Animated.Text alike. */
const isHostText = (n: renderer.ReactTestInstance): boolean => (n.type as unknown) === "Text";

/** All Text content of the tree, flattened — the clock string lives somewhere in here. Read off the
 *  host nodes: the clock is an `Animated.Text`, which wraps the Text module rather than the
 *  Inter-patched `Text` export (src/ui/fonts.ts), so `findAllByType(Text)` cannot see it. */
function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll(isHostText)
    .flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode))
    .join("");
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

  it("drives the urgency colour crossfade on the native thread (B-O18)", () => {
    const timingSpy = jest.spyOn(Animated, "timing");
    render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 25_000).toISOString()}
        frozen={false}
        reduceMotion={false}
        reconnecting={false}
        bidCount={2}
        noRiders={false}
        onUrgentChange={noop}
        onZero={noop}
      />,
    );
    tick(6_000); // 19s left — crosses into URGENT_MS, firing the crossfade again
    expect(timingSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [, config] of timingSpy.mock.calls) {
      expect(config).toEqual(expect.objectContaining({ useNativeDriver: true }));
    }
  });

  it("skips Animated.timing under reduce-motion (snaps via setValue instead)", () => {
    const timingSpy = jest.spyOn(Animated, "timing");
    render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 25_000).toISOString()}
        frozen={false}
        reduceMotion
        reconnecting={false}
        bidCount={2}
        noRiders={false}
        onUrgentChange={noop}
        onZero={noop}
      />,
    );
    tick(6_000); // 19s left — would cross into URGENT_MS under motion, but reduce-motion snaps instead
    expect(timingSpy).not.toHaveBeenCalled();
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

  it("sets the countdown in Inter, bold once urgent (Animated.Text is past the Inter patch)", () => {
    const tree = render(
      <AuctionClock
        expiresAt={new Date(Date.now() + 25_000).toISOString()}
        frozen={false}
        reduceMotion
        reconnecting={false}
        bidCount={2}
        noRiders={false}
        onUrgentChange={noop}
        onZero={noop}
      />,
    );
    const clockStyle = (): Record<string, unknown> => {
      const clock = tree.root.find((n) => isHostText(n) && n.props.accessibilityLabel != null);
      return (StyleSheet.flatten(clock.props.style) ?? {}) as Record<string, unknown>;
    };
    expect(clockStyle().fontFamily).toBe(fontFamilies.regular);
    tick(6_000); // 19s left — inside URGENT_MS
    expect(clockStyle().fontFamily).toBe(fontFamilies.bold);
    expect(clockStyle().fontWeight).toBeUndefined(); // a weight on top of the bold face double-bolds on Android
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
