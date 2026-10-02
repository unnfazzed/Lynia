/**
 * Home with both rails empty (owner 2026-10-02, ledger D-60): merchants are still being onboarded near
 * the customer, parcels work today — one "Send a parcel" button, no set-your-area prompt.
 */
import renderer, { act } from "react-test-renderer";
import { ComingSoonCard } from "../kit";

function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll((n) => typeof n.props.children === "string")
    .map((n) => n.props.children as string)
    .join(" | ");
}

it("says merchants are coming and offers Send a parcel — never asks to change the address", () => {
  const onSend = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ComingSoonCard onSend={onSend} />);
  });
  const t = texts(tree);
  expect(t).toContain("Coming soon near you");
  expect(t).toContain("We're bringing local restaurants and shops on board. Need something moved now? Send a parcel.");
  for (const gone of ["Nothing delivers here yet", "Set your area", "Use my location", "Type an address"]) expect(t).not.toContain(gone);
  const btn = tree.root.findAll((n) => n.props.accessibilityLabel === "Send a parcel" && typeof n.props.onPress === "function");
  expect(btn.length).toBeGreaterThan(0);
  act(() => btn[0]!.props.onPress());
  expect(onSend).toHaveBeenCalledTimes(1);
});
