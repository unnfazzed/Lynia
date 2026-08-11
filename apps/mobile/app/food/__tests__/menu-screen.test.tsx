/**
 * Foundation-E — RC.menu is the first REGION-ADOPTED interactive screen: its cover, dish-rows and cart
 * bar are GENERATED, guarded fragments (menu-cover / menu-rows / menu-cart-bar .view.tsx) that this
 * container composes. The structural-snapshot guardrail proves each fragment ≡ its mock sub-tree and
 * that the container mounts them in the mock's composition order; this test proves the refactor kept the
 * INTERACTIVE glue wired THROUGH those fragments — the region seam must not regress behaviour:
 *   • the cover's back button (a Pressable inside MenuCoverView) still navigates back,
 *   • tapping a dish row (MenuRowsView.onDishPress) still opens the live ItemSheet,
 *   • the cart bar (MenuCartBarView.onViewCart) still routes to the cart.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { ItemSheet } from "../../../src/ui/food/ItemSheet";
import { MenuCartBarView } from "../menu-cart-bar.view";
import { MenuCoverView } from "../menu-cover.view";
import { MenuRowsView } from "../menu-rows.view";

// The screen runs a 60s open/closed interval; fake timers keep it off the real clock after teardown.
jest.useFakeTimers();

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: (...a: unknown[]) => mockBack(...a), push: (...a: unknown[]) => mockPush(...a) }),
  useLocalSearchParams: () => ({ id: "m1" }),
}));

const dish = { id: "d1", name: "Sadza & beef stew", description: "Sadza, slow-cooked beef", priceUsd: 4.5, photoUrl: null, outOfStock: false };
const mockMenu = {
  restaurant: { id: "m1", name: "Sadza Republic", coverPhotoUrl: null, logoUrl: null, cuisineTags: ["Zimbabwean"], priceLevel: 2, hours: null, location: null },
  categories: [{ id: "c1", name: "Mains", dishes: [dish] }],
};
jest.mock("../../../src/query/use-restaurants", () => ({
  useRestaurantMenu: () => ({ menu: mockMenu, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useReopenReminder: () => ({ isSet: false, isPending: false, isLoading: false, toggle: jest.fn() }),
}));

const mockCart = {
  cart: { restaurantId: "m1", restaurantName: "Sadza Republic", lines: [{ dishId: "d1", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "" }], orderNote: "" },
  itemCount: 2,
  subtotal: 9,
  smallOrderFee: 0,
  total: 9,
  addItem: jest.fn(() => false),
  setLineQuantity: jest.fn(),
  removeLine: jest.fn(),
  replaceLines: jest.fn(),
  clear: jest.fn(),
};
jest.mock("../../../src/food/cart-context", () => ({
  useFoodCart: () => mockCart,
}));
// ToastProvider needs a SafeAreaProvider (useSafeAreaInsets), which the app supplies at its root but a
// unit render does not — stub the toast seam so the screen renders standalone (its own Screen's
// SafeAreaView tolerates no provider, mirroring app/food/__tests__/index.test.tsx).
jest.mock("../../../src/ui/Toast", () => ({
  useToast: () => ({ show: jest.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  pushToast: jest.fn(),
  TOAST_DURATION_MS: 3200,
}));

import RestaurantMenuScreen from "../[id]";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<RestaurantMenuScreen />);
  });
  return tree;
}

describe("RestaurantMenuScreen · region-fragment composition keeps the live glue wired (Foundation-E)", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
  });

  it("composes all three generated region fragments (cover, rows, cart bar)", () => {
    const tree = render();
    expect(tree.root.findAllByType(MenuCoverView)).toHaveLength(1);
    expect(tree.root.findAllByType(MenuRowsView)).toHaveLength(1);
    expect(tree.root.findAllByType(MenuCartBarView)).toHaveLength(1);
    // The rows fragment is fed the live dishes mapped to the kit item shape (+ id).
    const rows = tree.root.findByType(MenuRowsView).props.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ id: "d1", name: "Sadza & beef stew", price: 4.5, oos: false });
  });

  it("the cover fragment's back button still navigates back", () => {
    const tree = render();
    act(() => tree.root.findByType(MenuCoverView).props.onBack());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("tapping a dish row (through the rows fragment) opens the live ItemSheet", () => {
    const tree = render();
    expect(tree.root.findAllByType(ItemSheet)).toHaveLength(0);
    const rows = tree.root.findByType(MenuRowsView).props;
    act(() => rows.onDishPress(rows.rows[0]!));
    expect(tree.root.findByType(ItemSheet).props.dish).toMatchObject({ id: "d1" });
  });

  it("the cart bar fragment's View cart action routes to the cart, with the live label + subtotal", () => {
    const tree = render();
    const bar = tree.root.findByType(MenuCartBarView).props;
    expect(bar.itemLabel).toBe("2 items");
    expect(bar.subtotal).toBe(9);
    act(() => bar.onViewCart());
    expect(mockPush).toHaveBeenCalledWith("/food/cart");
  });
});
