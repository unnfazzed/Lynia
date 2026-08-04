import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { RatingCard } from "../RatingCard";

function textOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode).map(String));
}

let currentTree: renderer.ReactTestRenderer | null = null;

function render(saving: boolean | "queued"): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<RatingCard saving={saving} onRate={() => {}} />);
  });
  currentTree = tree;
  return tree;
}

afterEach(() => {
  // Unmount before the fake-timer teardown below so RatingCard's own unmount-flush effect clears any
  // still-armed rate timer, instead of leaving a real setTimeout dangling into a later, unrelated test.
  currentTree?.unmount();
  currentTree = null;
  jest.useRealTimers();
});

/**
 * ALR-09: `saving` mirrors the caller's rating mutation, which keeps the default
 * `networkMode:"online"` — a tap while offline PAUSES rather than sends, so `saving` alone (a plain
 * `isPending`) can't distinguish "genuinely saving" from "parked offline, hasn't even been sent yet".
 * Pre-fix this card had only two states (idle / "Saving your rating…"), so a paused save claimed to
 * be in progress for the whole outage.
 */
describe("RatingCard saving tri-state (ALR-09)", () => {
  it("shows the in-flight copy while genuinely saving (saving: true)", () => {
    const tree = render(true);
    expect(textOf(tree)).toContain("Saving your rating…");
  });

  it("shows an honest 'waiting to reconnect' cue instead of 'Saving…' while paused offline", () => {
    const tree = render("queued");
    const text = textOf(tree);
    expect(text.some((t) => t.includes("Waiting to reconnect"))).toBe(true);
    expect(text).not.toContain("Saving your rating…");
  });

  it("disables the stars while queued, same as while genuinely saving", () => {
    const tree = render("queued");
    const star = tree.root.findAll((n) => n.props.accessibilityLabel === "Rate 3 stars")[0]!;
    expect(star.props.disabled).toBe(true);
  });

  it("still shows the armed 'Submitting…' countdown even while queued (a live tap-to-rate takes priority)", () => {
    jest.useFakeTimers();
    const tree = render("queued");
    const star = tree.root.findAll((n) => n.props.accessibilityLabel === "Rate 5 stars")[0]!;
    act(() => star.props.onPress());
    const text = textOf(tree).join(" ");
    expect(text).toContain("Submitting");
    expect(text).toContain("5");
    // Let the armed commit fire under fake time, rather than leaving it to unmount-flush, so the
    // timer is accounted for before this test ends.
    act(() => jest.runAllTimers());
  });
});
