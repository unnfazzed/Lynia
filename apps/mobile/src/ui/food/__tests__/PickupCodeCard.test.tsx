/**
 * D5/N-16: the rider's pickup-code entry, plus R-12's PAID/NOT-PAID banner rendered on the same card.
 */
import renderer, { act } from "react-test-renderer";

import { PickupCodeCard } from "../PickupCodeCard";

// PickupCodeCard's heading ("Confirm pickup") and its Button's label share the same string, so pick
// whichever match actually has a pressable ancestor rather than assuming the first is the button.
function pressButton(tree: renderer.ReactTestRenderer, label: string): void {
  const candidates = tree.root.findAll((n) => n.props.children === label);
  for (const text of candidates) {
    let node: typeof text | null = text;
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    if (node) {
      node.props.onPress();
      return;
    }
  }
  throw new Error(`no pressable ancestor found for any match of "${label}"`);
}

// The attempts-remaining copy interpolates JSX (multiple <Text> children, some numeric) — a plain
// JSON.stringify search breaks on the comma/quote boundaries between sibling children, so walk the
// tree and concatenate each Text node's own children into one string before searching.
function textOf(node: renderer.ReactTestRendererJSON | string | number | null): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return (node.children ?? []).map(textOf).join("");
}
function rendersText(tree: renderer.ReactTestRenderer, substring: string): boolean {
  const json = tree.toJSON();
  const nodes = Array.isArray(json) ? json : json ? [json] : [];
  const flatten = (n: renderer.ReactTestRendererJSON): string[] => [textOf(n), ...(n.children ?? []).flatMap((c) => (typeof c === "object" ? flatten(c) : []))];
  return nodes.flatMap(flatten).some((s) => s.includes(substring));
}

describe("PickupCodeCard", () => {
  it("shows the NOT-PAID banner and the collect amount for an unpaid CASH order", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupCodeCard code="" onChangeCode={jest.fn()} attempts={0} pending={false} onConfirm={jest.fn()} paid={false} amountDue={15.5} />,
      );
    });
    expect(rendersText(tree, "NOT PAID")).toBe(true);
    expect(rendersText(tree, "$15.50")).toBe(true);
  });

  it("shows a PAID confirmation with the merchant's reference for a WALLET order", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupCodeCard code="" onChangeCode={jest.fn()} attempts={0} pending={false} onConfirm={jest.fn()} paid={true} paidReference="ref-4472" amountDue={null} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "PAID").length).toBeGreaterThan(0);
    expect(rendersText(tree, "ref-4472")).toBe(true);
  });

  it("disables confirm until 4 digits are entered, and fires onConfirm once they are", () => {
    const onConfirm = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupCodeCard code="72" onChangeCode={jest.fn()} attempts={0} pending={false} onConfirm={onConfirm} paid={false} amountDue={null} />,
      );
    });
    const candidates = tree.root.findAll((n) => n.props.children === "Confirm pickup");
    let button: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      let node: typeof c | null = c;
      while (node && typeof node.props.onPress !== "function") node = node.parent;
      if (node) {
        button = node;
        break;
      }
    }
    expect(button!.props.disabled).toBe(true);

    act(() => {
      tree.update(
        <PickupCodeCard code="7241" onChangeCode={jest.fn()} attempts={0} pending={false} onConfirm={onConfirm} paid={false} amountDue={null} />,
      );
    });
    act(() => {
      pressButton(tree, "Confirm pickup");
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows attempts-remaining copy after a wrong code, and locks at the max", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupCodeCard code="7241" onChangeCode={jest.fn()} attempts={2} pending={false} onConfirm={jest.fn()} paid={false} amountDue={null} />,
      );
    });
    expect(rendersText(tree, "didn't match")).toBe(true);
    expect(rendersText(tree, "3 attempt")).toBe(true);

    act(() => {
      tree.update(
        <PickupCodeCard code="7241" onChangeCode={jest.fn()} attempts={5} pending={false} onConfirm={jest.fn()} paid={false} amountDue={null} />,
      );
    });
    expect(rendersText(tree, "Too many attempts. Ask the kitchen to re-check the code")).toBe(true);
  });
});
