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
import { ActivityIndicator, Text, TextInput } from "react-native";
import renderer, { act } from "react-test-renderer";
import { AddressSearch } from "../AddressSearch";

let mockKeyed = true;

jest.mock("../../api/places", () => ({
  autocompletePlaces: (...args: unknown[]) => mockAutocomplete(...(args as [])),
  placeDetails: (...args: unknown[]) => mockPlaceDetails(...(args as [])),
  placesEnabled: jest.fn(() => mockKeyed),
}));

const mockGeocodeAddress = jest.fn();
jest.mock("../../logic/geocode", () => ({ geocodeAddress: (q: string) => mockGeocodeAddress(q) }));

const mockAutocomplete = jest.fn(async () => [] as unknown[]);
const mockPlaceDetails = jest.fn(async () => null as unknown);

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
  mockAutocomplete.mockReset().mockResolvedValue([]);
  mockPlaceDetails.mockReset().mockResolvedValue(null);
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

/**
 * The third dead-end path, and the one a PROVISIONED key does not rule out.
 *
 * A key Google refuses — a mis-restricted key (docs/SECURITY-OPS.md §B), or one in a suspended project,
 * as every key was from 2026-09-17 — fails every call. `mapPredictions` flattens that to the same `[]`
 * a genuine no-match gives, so the customer types into a live search box that will never offer
 * anything, and if the map's tiles are also dead, `coordsOk` is once again unreachable. The escape row
 * below is what keeps a keyed build off that path.
 */
describe("AddressSearch — a keyed search that returns nothing", () => {
  const ESCAPE = "No results — look it up on this phone";

  async function searchFor(tree: renderer.ReactTestRenderer, text: string): Promise<void> {
    const input = tree.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText(text);
    });
    // Clear the 300 ms debounce, then let the autocomplete promise settle.
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    mockKeyed = true;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("offers the device geocoder when autocomplete comes back empty", async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={jest.fn()} />);
    });
    expect(textOf(tree)).not.toContain(ESCAPE);

    await searchFor(tree, "14 Glenara Ave");
    expect(textOf(tree)).toContain(ESCAPE);

    act(() => tree.unmount());
  });

  it("resolves through it, so a denied key is no longer a dead end", async () => {
    const place = { lat: -17.83, lng: 31.05, landmark: "14 Glenara Ave", placeId: "" };
    mockGeocodeAddress.mockResolvedValue({ ok: true, place });
    const onResolved = jest.fn();

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={onResolved} />);
    });
    await searchFor(tree, "14 Glenara Ave");

    const escape = tree.root.findByProps({ accessibilityLabel: 'No results — look up "14 Glenara Ave" on this phone instead' });
    await act(async () => {
      (escape.props as { onPress: () => void }).onPress();
    });

    expect(mockGeocodeAddress).toHaveBeenCalledWith("14 Glenara Ave");
    expect(onResolved).toHaveBeenCalledWith(place);
    act(() => tree.unmount());
  });

  it("stays hidden when autocomplete does return suggestions", async () => {
    mockAutocomplete.mockResolvedValue([{ placeId: "abc", primary: "Eastgate Mall", secondary: "Harare" }]);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={jest.fn()} />);
    });
    await searchFor(tree, "Eastgate");

    expect(textOf(tree)).toContain("Eastgate Mall");
    expect(textOf(tree)).not.toContain(ESCAPE);
    act(() => tree.unmount());
  });

  // Details is asked for the address and point only (the Pro-tier `displayName` is not requested), so
  // the name the customer tapped is what leads the landmark the rider is handed.
  it("resolves a tapped suggestion, handing Details the suggestion's own name", async () => {
    mockAutocomplete.mockResolvedValue([{ placeId: "west", primary: "Westgate Shopping Centre", secondary: "Harare" }]);
    const place = { lat: -17.79, lng: 30.99, landmark: "Westgate Shopping Centre, Lomagundi Rd, Harare", placeId: "west" };
    mockPlaceDetails.mockResolvedValue(place);
    const onResolved = jest.fn();

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={onResolved} />);
    });
    await searchFor(tree, "westgate");

    const row = tree.root.findByProps({ accessibilityLabel: "Westgate Shopping Centre, Harare" });
    await act(async () => {
      (row.props as { onPress: () => void }).onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockPlaceDetails).toHaveBeenCalledWith("west", expect.any(String), "Westgate Shopping Centre");
    expect(onResolved).toHaveBeenCalledWith(place);
    act(() => tree.unmount());
  });
});

/** A promise the test settles by hand, to hold a request in flight across the customer's next move. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * A place chosen while a search is still pending. Every search came back empty until the Places key
 * started answering again (2026-09-29), which hid this. `choose` and `pick` neither cancelled the
 * debounced search nor retired the one in flight, so the older search landed after the tap. It put the
 * list, the spinner or the no-match row back under the place just chosen. And a place lookup still in
 * flight could land after the customer had tapped something else, typed, or cleared, and swap their
 * choice for the older one.
 */
describe("AddressSearch — a place chosen while a search is still pending", () => {
  const WESTGATE = { placeId: "west", primary: "Westgate Shopping Centre", secondary: "Harare" };
  const EASTGATE = { placeId: "east", primary: "Eastgate Mall", secondary: "Harare" };
  const WEST_PLACE = { lat: -17.79, lng: 30.99, landmark: "Westgate Shopping Centre, Lomagundi Rd, Harare", placeId: "west" };
  const EAST_PLACE = { lat: -17.83, lng: 31.05, landmark: "Eastgate Mall, Robert Mugabe Rd, Harare", placeId: "east" };
  const ESCAPE = "No results — look it up on this phone";

  beforeEach(() => {
    mockKeyed = true;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function mount(onResolved = jest.fn()): Promise<renderer.ReactTestRenderer> {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AddressSearch label="Drop-off" onResolved={onResolved} />);
    });
    return tree;
  }
  async function type(tree: renderer.ReactTestRenderer, text: string): Promise<void> {
    await act(async () => {
      tree.root.findByType(TextInput).props.onChangeText(text);
    });
  }
  /** Past the 300 ms debounce, then let whatever resolved settle. */
  async function waitOutDebounce(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }
  async function tap(tree: renderer.ReactTestRenderer, label: string): Promise<void> {
    // The first match: a `Tappable` hands its props on to the Pressable it renders, so both carry the label.
    const [target] = tree.root.findAllByProps({ accessibilityLabel: label });
    if (!target) throw new Error(`nothing on screen is labelled "${label}"`);
    await act(async () => {
      (target.props as { onPress: () => void }).onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }
  const listed = (tree: renderer.ReactTestRenderer, label: string): boolean => tree.root.findAllByProps({ accessibilityLabel: label }).length > 0;
  const fieldValue = (tree: renderer.ReactTestRenderer): string => tree.root.findByType(TextInput).props.value as string;

  it("a tap inside the debounce window cancels the search that was about to start", async () => {
    mockAutocomplete.mockResolvedValue([WESTGATE]);
    mockPlaceDetails.mockResolvedValue(WEST_PLACE);
    const onResolved = jest.fn();
    const tree = await mount(onResolved);
    await type(tree, "westg");
    await waitOutDebounce();
    expect(listed(tree, "Westgate Shopping Centre, Harare")).toBe(true);

    // One more keystroke queues the next search, and the customer taps the row already on screen
    // before its debounce runs out.
    await type(tree, "westgate");
    await tap(tree, "Westgate Shopping Centre, Harare");
    expect(onResolved).toHaveBeenCalledWith(WEST_PLACE);

    await waitOutDebounce();
    expect(mockAutocomplete).toHaveBeenCalledTimes(1);
    expect(listed(tree, "Westgate Shopping Centre, Harare")).toBe(false);
    expect(fieldValue(tree)).toBe(WEST_PLACE.landmark);
    act(() => tree.unmount());
  });

  it.each([
    ["a list", [WESTGATE]],
    ["no results", []],
  ])("a search still in flight at the tap cannot bring back %s", async (_label, lateRows) => {
    const late = deferred<unknown[]>();
    mockAutocomplete.mockResolvedValueOnce([WESTGATE]).mockReturnValueOnce(late.promise);
    mockPlaceDetails.mockResolvedValue(WEST_PLACE);
    const tree = await mount();
    await type(tree, "westg");
    await waitOutDebounce();
    await type(tree, "westgate");
    await waitOutDebounce(); // the "westgate" search is now in flight
    expect(mockAutocomplete).toHaveBeenCalledTimes(2);

    await tap(tree, "Westgate Shopping Centre, Harare");
    // The place resolved, so nothing is loading any more, even though that search has not answered.
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);

    await act(async () => {
      late.resolve(lateRows);
      await Promise.resolve();
    });
    expect(listed(tree, "Westgate Shopping Centre, Harare")).toBe(false);
    expect(textOf(tree)).not.toContain(ESCAPE);
    expect(fieldValue(tree)).toBe(WEST_PLACE.landmark);
    act(() => tree.unmount());
  });

  it("the last place tapped wins, even when an earlier tap's lookup answers after it", async () => {
    mockAutocomplete.mockResolvedValue([WESTGATE, EASTGATE]);
    const slowWest = deferred<unknown>();
    mockPlaceDetails.mockReturnValueOnce(slowWest.promise).mockResolvedValueOnce(EAST_PLACE);
    const onResolved = jest.fn();
    const tree = await mount(onResolved);
    await type(tree, "gate");
    await waitOutDebounce();

    await tap(tree, "Westgate Shopping Centre, Harare"); // its lookup hangs…
    await tap(tree, "Eastgate Mall, Harare"); // …so they tap the one they meant
    await act(async () => {
      slowWest.resolve(WEST_PLACE);
      await Promise.resolve();
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith(EAST_PLACE);
    expect(fieldValue(tree)).toBe(EAST_PLACE.landmark);
    act(() => tree.unmount());
  });

  it("a lookup that answers after the customer started typing again does not overwrite them", async () => {
    mockAutocomplete.mockResolvedValue([WESTGATE]);
    const slowWest = deferred<unknown>();
    mockPlaceDetails.mockReturnValueOnce(slowWest.promise);
    const onResolved = jest.fn();
    const tree = await mount(onResolved);
    await type(tree, "westgate");
    await waitOutDebounce();

    await tap(tree, "Westgate Shopping Centre, Harare");
    await type(tree, "Avondale shops");
    await act(async () => {
      slowWest.resolve(WEST_PLACE);
      await Promise.resolve();
    });

    expect(onResolved).not.toHaveBeenCalled();
    expect(fieldValue(tree)).toBe("Avondale shops");
    act(() => tree.unmount());
  });

  it("clearing the field inside the debounce window cancels the search that was about to start", async () => {
    mockAutocomplete.mockResolvedValue([WESTGATE]);
    const tree = await mount();
    await type(tree, "westg");
    await waitOutDebounce();
    await type(tree, "westgate");

    await tap(tree, "Clear search");
    await waitOutDebounce();

    expect(mockAutocomplete).toHaveBeenCalledTimes(1);
    expect(listed(tree, "Westgate Shopping Centre, Harare")).toBe(false);
    expect(fieldValue(tree)).toBe("");
    act(() => tree.unmount());
  });

  it("a device lookup that answers after the customer started typing again does not overwrite them", async () => {
    const slowDevice = deferred<unknown>();
    mockGeocodeAddress.mockReturnValueOnce(slowDevice.promise);
    const onResolved = jest.fn();
    const tree = await mount(onResolved);
    await type(tree, "14 Glenara Ave");
    await waitOutDebounce(); // no Places rows, so the escape row is offered

    await tap(tree, 'No results — look up "14 Glenara Ave" on this phone instead');
    await type(tree, "Avondale shops");
    await act(async () => {
      slowDevice.resolve({ ok: true, place: { lat: -17.83, lng: 31.05, landmark: "14 Glenara Ave", placeId: "" } });
      await Promise.resolve();
    });

    expect(onResolved).not.toHaveBeenCalled();
    expect(fieldValue(tree)).toBe("Avondale shops");
    act(() => tree.unmount());
  });
});

/**
 * D-31 (owner instruction 2026-08-17): the field carries the address its slot already holds.
 *
 * The pickup pin is auto-located on open, so the compose sheet used to show a FILLED pickup row above
 * an EMPTY search box — and the empty box read as the drop-off's (the owner's own report). Seeding it
 * makes the field say which address it belongs to. The rule that keeps it from becoming a nuisance:
 * only a CHANGE of the underlying address writes to the field, so a customer typing over it, or
 * clearing it outright, is never overruled by a re-render.
 */
describe("AddressSearch — prefilled from the slot's address (D-31)", () => {
  beforeEach(() => {
    mockKeyed = true;
  });

  it("opens carrying the address the slot already holds", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Pickup" prefill="My Current Spot, Harare CBD" onResolved={jest.fn()} />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe("My Current Spot, Harare CBD");
    act(() => tree.unmount());
  });

  it("re-seeds when the address behind the slot moves", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Pickup" prefill="Old Spot" onResolved={jest.fn()} />);
    });
    act(() => {
      tree.update(<AddressSearch label="Pickup" prefill="New Spot" onResolved={jest.fn()} />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe("New Spot");
    act(() => tree.unmount());
  });

  it("never overrules what the customer typed, or a field they cleared", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Pickup" prefill="My Current Spot" onResolved={jest.fn()} />);
    });

    act(() => {
      tree.root.findByType(TextInput).props.onChangeText("Somewhere else entirely");
    });
    // A re-render with the SAME prefill must not put the old address back over their typing.
    act(() => {
      tree.update(<AddressSearch label="Pickup" prefill="My Current Spot" onResolved={jest.fn()} />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe("Somewhere else entirely");

    // Same for an emptied field — clearing is a decision, not a gap to refill.
    act(() => {
      tree.root.findByType(TextInput).props.onChangeText("");
    });
    act(() => {
      tree.update(<AddressSearch label="Pickup" prefill="My Current Spot" onResolved={jest.fn()} />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe("");
    act(() => tree.unmount());
  });

  it("seeds the keyless field the same way", () => {
    mockKeyed = false;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AddressSearch label="Pickup" prefill="My Current Spot" onResolved={jest.fn()} />);
    });
    expect(tree.root.findByType(TextInput).props.value).toBe("My Current Spot");
    act(() => tree.unmount());
  });
});
