/**
 * D4/R-09: the delivery code stays masked (CASH) until a deliberate press-and-hold, never a plain tap
 * — "no code to wave at the door before paying." A WALLET order (`masked` false) shows plainly, no
 * gesture. The reveal itself must work with `code` already in hand and no network involved (that's
 * what makes it the offline fallback too) — this test only exercises the pure gesture/prop contract.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

import { DeliveryCodeCard } from "../DeliveryCodeCard";

function findByLabel(tree: renderer.ReactTestRenderer, label: string): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no node with accessibilityLabel="${label}"`);
  return node;
}

describe("DeliveryCodeCard", () => {
  it("shows the code plainly with no gesture when masked=false (WALLET, already paid)", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<DeliveryCodeCard code="418302" masked={false} unavailableHint="Fetching your code…" />);
    });
    expect(tree.root.findAll((n) => n.props.children === "418302").length).toBeGreaterThan(0);
  });

  it("masks a CASH code until the press-and-hold reveal fires", () => {
    const onReveal = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<DeliveryCodeCard code="418302" masked unavailableHint="Appears once you both confirm the cash." onReveal={onReveal} />);
    });
    expect(tree.root.findAll((n) => n.props.children === "418302").length).toBe(0);
    act(() => {
      findByLabel(tree, "Press and hold to reveal the delivery code").props.onLongPress();
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(tree.root.findAll((n) => n.props.children === "418302").length).toBeGreaterThan(0);
  });

  it("calls onReveal only once across repeated reveals of the same mount", () => {
    const onReveal = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<DeliveryCodeCard code="418302" masked unavailableHint="hint" onReveal={onReveal} />);
    });
    act(() => {
      findByLabel(tree, "Press and hold to reveal the delivery code").props.onLongPress();
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("disables the reveal gesture and shows the unavailable hint while there is no code yet", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<DeliveryCodeCard code={null} masked unavailableHint="Appears once you both confirm the cash." />);
    });
    const pressable = findByLabel(tree, "Delivery code not available yet");
    expect(pressable.props.disabled).toBe(true);
    expect(tree.root.findAll((n) => n.props.children === "Appears once you both confirm the cash.").length).toBeGreaterThan(0);
  });
});
