/**
 * Rating-on-tap (D3) commit semantics. A star tap arms a 4s undo window; `onRate` fires when it lapses.
 * The behaviours under test: Undo cancels the pending submit, and — the fix — leaving the screen
 * (unmount) while a rating is still armed FLUSHES it rather than silently dropping the rating the
 * customer already saw as "Submitting {n}★".
 */
import renderer, { act } from "react-test-renderer";

import { RatingCard } from "../RatingCard";

jest.useFakeTimers();

function findByLabel(tree: renderer.ReactTestRenderer, label: string): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no node with accessibilityLabel="${label}"`);
  return node;
}

/** The Undo button renders its label as a child <Text>; walk up to the pressable that owns onPress. */
function pressUndo(tree: renderer.ReactTestRenderer): void {
  const undoText = tree.root.findAll((n) => n.props.children === "Undo")[0];
  let node: typeof undoText | null = undoText;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  node?.props.onPress();
}

describe("RatingCard commit semantics", () => {
  it("fires onRate once the undo window lapses", () => {
    const onRate = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} />); });
    act(() => { findByLabel(tree, "Rate 4 stars").props.onPress(); });
    expect(onRate).not.toHaveBeenCalled(); // still cancellable
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(onRate).toHaveBeenCalledWith(4);
  });

  it("Undo cancels the pending submit", () => {
    const onRate = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} />); });
    act(() => { findByLabel(tree, "Rate 3 stars").props.onPress(); });
    act(() => { pressUndo(tree); });
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(onRate).not.toHaveBeenCalled();
  });

  it("flushes an armed rating on unmount instead of dropping it", () => {
    const onRate = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} />); });
    act(() => { findByLabel(tree, "Rate 5 stars").props.onPress(); });
    // Customer navigates away within the window (component unmounts) — the rating must still submit.
    act(() => { tree.unmount(); });
    expect(onRate).toHaveBeenCalledWith(5);
  });

  it("does NOT re-fire on unmount after the rating already committed", () => {
    const onRate = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} />); });
    act(() => { findByLabel(tree, "Rate 2 stars").props.onPress(); });
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(onRate).toHaveBeenCalledTimes(1);
    act(() => { tree.unmount(); });
    expect(onRate).toHaveBeenCalledTimes(1); // no double-submit
  });

  // BH-06: a setTimeout + ref alone don't survive an OS-level app kill (only a React unmount does,
  // per the tests above) — the caller needs a synchronous "armed" signal to persist a durable marker
  // BEFORE the undo window starts, and a matching "cancelled" signal to drop it on Undo.
  it("calls onArm synchronously the instant a star is tapped, before the undo window lapses", () => {
    const onRate = jest.fn();
    const onArm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} onArm={onArm} />); });
    act(() => { findByLabel(tree, "Rate 4 stars").props.onPress(); });
    expect(onArm).toHaveBeenCalledWith(4);
    expect(onRate).not.toHaveBeenCalled();
  });

  it("calls onUndo when Undo cancels the pending submit, so the caller can drop its durable marker", () => {
    const onRate = jest.fn();
    const onUndo = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} onUndo={onUndo} />); });
    act(() => { findByLabel(tree, "Rate 3 stars").props.onPress(); });
    act(() => { pressUndo(tree); });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("re-arms (calls onArm again) on a second star tap without an intervening onUndo", () => {
    const onRate = jest.fn();
    const onArm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<RatingCard saving={false} onRate={onRate} onArm={onArm} />); });
    act(() => { findByLabel(tree, "Rate 2 stars").props.onPress(); });
    act(() => { findByLabel(tree, "Rate 5 stars").props.onPress(); });
    expect(onArm).toHaveBeenNthCalledWith(1, 2);
    expect(onArm).toHaveBeenNthCalledWith(2, 5);
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(onRate).toHaveBeenCalledWith(5);
    expect(onRate).not.toHaveBeenCalledWith(2);
  });
});
