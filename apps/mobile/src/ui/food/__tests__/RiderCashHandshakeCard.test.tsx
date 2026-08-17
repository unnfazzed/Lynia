/**
 * D5/R-04/R-05: the CASH doorstep handshake card, RIDER half — the mirror of CashHandshakeCard.test.tsx,
 * driven by the same HandshakeState (see logic/food-doorstep.test.ts for the state derivation itself).
 */
import renderer, { act } from "react-test-renderer";

import { RiderCashHandshakeCard } from "../RiderCashHandshakeCard";

function pressButton(tree: renderer.ReactTestRenderer, label: string): void {
  const text = tree.root.findAll((n) => n.props.children === label)[0];
  if (!text) throw new Error(`no button labelled "${label}"`);
  let node: typeof text | null = text;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`"${label}" has no pressable ancestor`);
  node.props.onPress();
}

describe("RiderCashHandshakeCard", () => {
  it("pending: tells the rider to hand over the food first, no confirm action yet", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RiderCashHandshakeCard state="pending" amount={15.5} confirmedAt={null} nowMs={0} onConfirm={jest.fn()} onDispute={jest.fn()} busy={false} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "1 · Hand over the food first").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.children === "Confirm · I received $15.50").length).toBe(0);
  });

  it("waiting_rider: shows the collected amount and fires onConfirm/onDispute", () => {
    const onConfirm = jest.fn();
    const onDispute = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RiderCashHandshakeCard
          state="waiting_rider"
          amount={15.5}
          confirmedAt="2026-07-31T10:14:00.000Z"
          nowMs={new Date("2026-07-31T10:14:10.000Z").getTime()}
          onConfirm={onConfirm}
          onDispute={onDispute}
          busy={false}
        />,
      );
    });
    act(() => {
      pressButton(tree, "Confirm · I received $15.50");
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => {
      pressButton(tree, "The amount is wrong — talk to support");
    });
    expect(onDispute).toHaveBeenCalledTimes(1);
  });

  it("frozen: shows the flagged-order copy, no confirm action", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RiderCashHandshakeCard state="frozen" amount={15.5} confirmedAt="2026-07-31T10:14:00.000Z" nowMs={0} onConfirm={jest.fn()} onDispute={jest.fn()} busy={false} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "We've flagged this order").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.children === "Confirm · I received $15.50").length).toBe(0);
  });

  it("confirmed / not_cash: renders nothing (the delivery code takes over)", () => {
    let confirmedTree!: renderer.ReactTestRenderer;
    act(() => {
      confirmedTree = renderer.create(
        <RiderCashHandshakeCard state="confirmed" amount={15.5} confirmedAt="2026-07-31T10:14:00.000Z" nowMs={0} onConfirm={jest.fn()} onDispute={jest.fn()} busy={false} />,
      );
    });
    expect(confirmedTree.toJSON()).toBeNull();

    let notCashTree!: renderer.ReactTestRenderer;
    act(() => {
      notCashTree = renderer.create(
        <RiderCashHandshakeCard state="not_cash" amount={15.5} confirmedAt={null} nowMs={0} onConfirm={jest.fn()} onDispute={jest.fn()} busy={false} />,
      );
    });
    expect(notCashTree.toJSON()).toBeNull();
  });
});
