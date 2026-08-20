import React from "react";
import { Text } from "react-native";
import renderer from "react-test-renderer";
import { HomeStatusRow } from "../index";
import { tokens } from "@lynia/shared/tokens";

/**
 * The rider's shift-status row (D-29 amendment, owner decision 2026-08-20).
 *
 * WHAT THIS PROTECTS. The rider is ALWAYS ONLINE — there is no switch — so this row is the only
 * affirmative signal on the board that a shift is live. Before it, a healthy board said nothing at
 * all: the reconnecting banner speaks only when something is WRONG, so silence meant both "online"
 * and "broken" and the rider could not tell which.
 *
 * The two invariants worth a test, because both regress silently:
 *   1. The dot is HONEST — accent only while the socket is live, muted while reconnecting. A rider
 *      who has lost the board socket must never read as fully online; that is the whole point of
 *      the dot rather than a static "Online" label.
 *   2. NO ACTION unless one is passed. The row's component still supports an "Go offline" action
 *      (it was built for the pre-D-29 toggle), so a future caller could hand it one by reflex and
 *      quietly reintroduce a shift control the owner removed twice. Absence is the contract here.
 */
function textOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode).map(String));
}

/** The status dot is the one 7x7 rounded View in the row; its backgroundColor carries the state. */
function dotColor(tree: renderer.ReactTestRenderer): unknown {
  const dot = tree.root.findAll((n) => {
    const s = n.props?.style as { width?: number; height?: number; borderRadius?: number } | undefined;
    return !!s && s.width === 7 && s.height === 7 && s.borderRadius === 3.5;
  })[0];
  return (dot?.props?.style as { backgroundColor?: unknown })?.backgroundColor;
}

describe("HomeStatusRow — rider shift status", () => {
  it("renders the label", () => {
    const tree = renderer.create(<HomeStatusRow label="Online" connected />);
    expect(textOf(tree)).toContain("Online");
  });

  it("paints the dot accent while the socket is live", () => {
    const tree = renderer.create(<HomeStatusRow label="Online" connected />);
    expect(dotColor(tree)).toBe(tokens.color.accent);
  });

  it("paints the dot muted while reconnecting — never a confident green on a dead socket", () => {
    const tree = renderer.create(<HomeStatusRow label="Reconnecting" connected={false} />);
    expect(dotColor(tree)).toBe(tokens.color.muted);
    expect(textOf(tree)).toContain("Reconnecting");
  });

  it("renders NO shift control when no action is passed (always-online, D-29)", () => {
    const tree = renderer.create(<HomeStatusRow label="Online" connected />);
    // Nothing tappable, and specifically none of the shift-control labels the pre-D-29 toggle used.
    expect(tree.root.findAll((n) => n.props?.accessibilityRole === "button").length).toBe(0);
    const labels = textOf(tree);
    expect(labels).not.toContain("Go offline");
    expect(labels).not.toContain("Go online");
  });

  it("joins label and detail with the kit separator when a detail is given", () => {
    const tree = renderer.create(<HomeStatusRow label="Online" detail="one queue" connected />);
    expect(textOf(tree)).toContain("Online · one queue");
  });
});
