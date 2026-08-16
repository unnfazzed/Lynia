/**
 * Search-first addressing: the KEY GATE regression test.
 *
 * The shipped store build rendered zero address-search UI because no Places key was provisioned, and
 * nothing caught it: `AddressSearch` returned `null` when unkeyed, and app/__tests__/send.test.tsx
 * mocks this component out wholesale. So a build that silently dropped the entire search path stayed
 * green. See docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md §2.
 *
 * The unkeyed half of the gate has since been raised twice. `null` became a visible-but-DEAD explainer
 * field, which was honest and still a dead end: with the compose map's tiles also failing to render
 * (the 2026-08-16 report), no affordance on the screen could produce a coordinate, so `coordsOk` in
 * send.tsx could never be satisfied and Broadcast stayed disabled forever. The unkeyed field is now
 * LIVE, resolved by the device's own geocoder, which needs neither Google key nor a working map.
 *
 * These pin both halves: keyed ⇒ Places autocomplete; unkeyed ⇒ a real field that still resolves.
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

const mockGeocodeAddress = jest.fn();
jest.mock("../../logic/geocode", () => ({ geocodeAddress: (q: string) => mockGeocodeAddress(q) }));

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

beforeEach(() => {
  mockGeocodeAddress.mockReset();
});

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

  it("renders a LIVE field, not a dead explainer, when no key is configured", () => {
    mockKeyed = false;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={jest.fn()} />);
    });

    // The original regression: this rendered nothing at all, leaving the address rows' search
    // magnifier pointing at a search that did not exist.
    expect(tree.toJSON()).not.toBeNull();
    // The second regression: a field the customer could not type into was the only thing left on a
    // screen whose map had also failed — an unreachable Broadcast with no way forward.
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it("resolves a typed address through the device geocoder when unkeyed", async () => {
    mockKeyed = false;
    const place = { lat: -17.83, lng: 31.05, landmark: "14 Glenara Ave", placeId: "" };
    mockGeocodeAddress.mockResolvedValue({ ok: true, place });
    const onResolved = jest.fn();

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={onResolved} />);
    });
    const input = tree.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText("14 Glenara Ave");
    });
    await act(async () => {
      input.props.onSubmitEditing();
    });

    expect(mockGeocodeAddress).toHaveBeenCalledWith("14 Glenara Ave");
    // Feeds the identical confirm-then-commit flow the Places path uses.
    expect(onResolved).toHaveBeenCalledWith(place);
    act(() => tree.unmount());
  });

  it("says why a lookup failed instead of failing silently", async () => {
    mockKeyed = false;
    mockGeocodeAddress.mockResolvedValue({ ok: false, reason: "not-found" });
    const onResolved = jest.fn();

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={onResolved} />);
    });
    const input = tree.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText("nowhere at all");
    });
    await act(async () => {
      input.props.onSubmitEditing();
    });

    expect(onResolved).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain("Couldn't find that address");
    // Every failure line still names the pin as the way through.
    expect(textOf(tree)).toContain("tap the map");
    act(() => tree.unmount());
  });
});
