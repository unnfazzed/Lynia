/**
 * D4/R-04/R-05: the CASH doorstep handshake card — one component, four states, driven purely by
 * `HandshakeState` (see logic/food-doorstep.test.ts for the state derivation itself).
 */
import renderer, { act } from "react-test-renderer";

import { CashHandshakeCard } from "../CashHandshakeCard";

/** Buttons here render their label as a plain child <Text> (see src/ui/index.tsx's Button) — walk up
 *  from that text node to the nearest ancestor Pressable that owns onPress, same helper shape as
 *  rating-card.test.tsx's pressUndo. */
function pressButton(tree: renderer.ReactTestRenderer, label: string): void {
  const text = tree.root.findAll((n) => n.props.children === label)[0];
  if (!text) throw new Error(`no button labelled "${label}"`);
  let node: typeof text | null = text;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`"${label}" has no pressable ancestor`);
  node.props.onPress();
}

describe("CashHandshakeCard", () => {
  it("pending: shows the amount and fires onConfirm when tapped", () => {
    const onConfirm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <CashHandshakeCard state="pending" amount={15.5} confirmedAt={null} nowMs={0} onConfirm={onConfirm} busy={false} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "I gave the rider $15.50").length).toBeGreaterThan(0);
    act(() => {
      pressButton(tree, "I gave the rider $15.50");
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("waiting_rider: shows a live countdown off the server's confirm timestamp, not a client timer", () => {
    const confirmedAt = "2026-07-31T10:14:00.000Z";
    const nowMs = new Date("2026-07-31T10:14:35.000Z").getTime(); // 35s in
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <CashHandshakeCard state="waiting_rider" amount={15.5} confirmedAt={confirmedAt} nowMs={nowMs} onConfirm={jest.fn()} busy={false} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "1:25").length).toBeGreaterThan(0); // 120s - 35s left
    expect(tree.root.findAll((n) => n.props.children === "Waiting for your rider to confirm").length).toBeGreaterThan(0);
  });

  it("frozen: shows the flagged-order copy, no confirm action", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <CashHandshakeCard state="frozen" amount={15.5} confirmedAt="2026-07-31T10:14:00.000Z" nowMs={0} onConfirm={jest.fn()} busy={false} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "We've flagged this order").length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.children === "I gave the rider $15.50").length).toBe(0);
  });

  it("confirmed / not_cash: renders nothing (the code card takes over)", () => {
    let confirmedTree!: renderer.ReactTestRenderer;
    act(() => {
      confirmedTree = renderer.create(
        <CashHandshakeCard state="confirmed" amount={15.5} confirmedAt="2026-07-31T10:14:00.000Z" nowMs={0} onConfirm={jest.fn()} busy={false} />,
      );
    });
    expect(confirmedTree.toJSON()).toBeNull();

    let notCashTree!: renderer.ReactTestRenderer;
    act(() => {
      notCashTree = renderer.create(<CashHandshakeCard state="not_cash" amount={15.5} confirmedAt={null} nowMs={0} onConfirm={jest.fn()} busy={false} />);
    });
    expect(notCashTree.toJSON()).toBeNull();
  });
});
