/**
 * Search-first addressing: the KEY GATE regression test.
 *
 * The shipped store build rendered zero address-search UI because no Places key was provisioned, and
 * nothing caught it: `AddressSearch` returned `null` when unkeyed, and app/__tests__/send.test.tsx
 * mocks this component out wholesale. So a build that silently dropped the entire search path stayed
 * green. See docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md §2.
 *
 * These pin the two halves of the gate: keyed ⇒ a real search field; unkeyed ⇒ a VISIBLE explainer
 * naming the pin fallback, never an empty render.
 *
 * `placesEnabled` is read through `../api/places` at render time, so a mutable mock flips the gate
 * between tests. (Re-requiring the module under `jest.resetModules()` would hand the component a
 * second copy of React and break hooks.)
 */
import React from "react";
import { Text, TextInput } from "react-native";
import renderer, { act } from "react-test-renderer";
import { AddressSearch } from "../AddressSearch";

let mockKeyed = true;

jest.mock("../../api/places", () => ({
  autocompletePlaces: jest.fn(async () => []),
  placeDetails: jest.fn(async () => null),
  placesEnabled: jest.fn(() => mockKeyed),
}));

jest.mock("../../logic/saved-places", () => ({
  addRecent: jest.fn(async () => []),
  loadRecents: jest.fn(async () => []),
  loadSaved: jest.fn(async () => ({ home: null, work: null })),
  saveSlot: jest.fn(async () => ({ home: null, work: null })),
}));

/** Collect every rendered string in the tree, so assertions read against what a user would see. */
function textOf(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => JSON.stringify(n.props.children))
    .join(" ");
}

describe("AddressSearch key gate", () => {
  it("renders a usable search field when a Places key is configured", () => {
    mockKeyed = true;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Drop-off" placeholder="Search drop-off address" onResolved={jest.fn()} />);
    });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(textOf(tree)).not.toContain("unavailable");
    act(() => tree.unmount());
  });

  it("renders a VISIBLE explainer naming the pin fallback when no key is configured", () => {
    mockKeyed = false;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={jest.fn()} />);
    });

    // The regression: this used to render nothing at all, leaving the address rows' search magnifier
    // pointing at a search that did not exist.
    expect(tree.toJSON()).not.toBeNull();
    // No live input to type into — but the customer is told where the address goes instead.
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(textOf(tree)).toContain("tap the map");
    act(() => tree.unmount());
  });
});
