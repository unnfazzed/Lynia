/**
 * Home with both rails empty: merchants are still being onboarded near the customer. Empty states v2
 * (handoff empty-states-v2-2026-10, ledger D-78) draws it as the quiet `store` empty state with no
 * action — the owner removed D-60's "Send a parcel" button — and never a set-your-area prompt.
 */
import renderer, { act } from "react-test-renderer";
import { ComingSoonCard } from "../kit";

function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll((n) => typeof n.props.children === "string")
    .map((n) => n.props.children as string)
    .join(" | ");
}

it("says places are coming, with no button and no address prompt", () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ComingSoonCard />);
  });
  const t = texts(tree);
  expect(t).toContain("Coming soon near you");
  expect(t).toContain("We’re adding places in your area.");
  for (const gone of ["Send a parcel", "Set your area", "Use my location", "Type an address"]) expect(t).not.toContain(gone);
  expect(tree.root.findAll((n) => n.props.accessibilityRole === "button").length).toBe(0);
});
