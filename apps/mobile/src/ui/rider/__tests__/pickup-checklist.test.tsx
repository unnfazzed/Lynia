/**
 * JOURNEY-BUGS: at zero items ticked, "Confirm N items collected" disabled with no other action —
 * a soft dead end for a rider who genuinely can't find the parcel. onCantCollect gives a discoverable
 * way out right where the rider is stuck, reusing the existing pre-pickup bail flow.
 */
import renderer, { act } from "react-test-renderer";

import { PickupChecklist } from "../PickupChecklist";

const ITEMS = [{ description: "Documents", quantity: 1 }];

function findByText(tree: renderer.ReactTestRenderer, text: string): renderer.ReactTestInstance {
  const node = tree.root.findAll((n) => n.props.children === text)[0];
  if (!node) throw new Error(`no node with text "${text}"`);
  return node;
}

function press(node: renderer.ReactTestInstance): void {
  let n: typeof node | null = node;
  while (n && typeof n.props.onPress !== "function") n = n.parent;
  n?.props.onPress();
}

describe("PickupChecklist — 'can't collect' escape hatch", () => {
  it("shows the 'can't find the parcel' link only at zero items ticked, and it fires onCantCollect", () => {
    const onCantCollect = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set()}
          collectedCount={0}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          onCantCollect={onCantCollect}
        />,
      );
    });
    act(() => { press(findByText(tree, "Can't find the parcel? Cancel this job")); });
    expect(onCantCollect).toHaveBeenCalledTimes(1);
  });

  it("hides the escape hatch once at least one item is ticked", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupChecklist
          items={ITEMS}
          checkedItems={new Set([0])}
          collectedCount={1}
          pending={false}
          onToggle={() => {}}
          onConfirm={() => {}}
          onCantCollect={() => {}}
        />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "Can't find the parcel? Cancel this job")).toHaveLength(0);
  });

  it("renders nothing extra when onCantCollect isn't provided (back-compat)", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PickupChecklist items={ITEMS} checkedItems={new Set()} collectedCount={0} pending={false} onToggle={() => {}} onConfirm={() => {}} />,
      );
    });
    expect(tree.root.findAll((n) => n.props.children === "Can't find the parcel? Cancel this job")).toHaveLength(0);
  });
});
