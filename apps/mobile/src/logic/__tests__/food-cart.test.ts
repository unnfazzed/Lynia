import {
  addLine,
  cartItemCount,
  cartSmallOrderFee,
  cartSubtotal,
  cartTotal,
  type FoodCartLine,
  isBelowMinimumOrder,
  removeLine,
  setLineQuantity,
} from "../food-cart";

const huku: FoodCartLine = { dishId: "d1", name: "Half roast huku", priceUsd: 6, quantity: 1, note: "" };
const sadza: FoodCartLine = { dishId: "d2", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 1, note: "" };

describe("addLine", () => {
  it("appends a new dish as its own line", () => {
    expect(addLine([huku], sadza)).toEqual([huku, sadza]);
  });

  it("sums quantity when the same dish + note is added again", () => {
    const result = addLine([huku], { ...huku, quantity: 2 });
    expect(result).toEqual([{ ...huku, quantity: 3 }]);
  });

  it("keeps a different note on the same dish as a separate line", () => {
    const withNote: FoodCartLine = { ...huku, note: "no chilli" };
    expect(addLine([huku], withNote)).toEqual([huku, withNote]);
  });

  it("caps a summed quantity at MAX_ITEM_QTY", () => {
    const result = addLine([{ ...huku, quantity: 19 }], { ...huku, quantity: 5 });
    expect(result[0]!.quantity).toBe(20);
  });
});

describe("setLineQuantity", () => {
  it("updates the matching line's quantity", () => {
    expect(setLineQuantity([huku, sadza], "d1", "", 3)).toEqual([{ ...huku, quantity: 3 }, sadza]);
  });

  it("removes the line when set to 0", () => {
    expect(setLineQuantity([huku, sadza], "d1", "", 0)).toEqual([sadza]);
  });

  it("leaves other dishes/notes untouched", () => {
    expect(setLineQuantity([huku], "d2", "", 5)).toEqual([huku]);
  });
});

describe("removeLine", () => {
  it("removes only the matching dish + note", () => {
    expect(removeLine([huku, sadza], "d1", "")).toEqual([sadza]);
  });
});

describe("totals", () => {
  const lines = [huku, { ...sadza, quantity: 2 }];

  it("counts total items", () => {
    expect(cartItemCount(lines)).toBe(3);
  });

  it("sums the subtotal", () => {
    expect(cartSubtotal(lines)).toBeCloseTo(6 + 4.5 * 2);
  });

  it("applies the N-15 small-order fee below the $4.00 minimum", () => {
    const tinyLines: FoodCartLine[] = [{ dishId: "d3", name: "Side", priceUsd: 2.5, quantity: 1, note: "" }];
    expect(cartSmallOrderFee(tinyLines)).toBe(1);
    expect(cartTotal(tinyLines)).toBeCloseTo(3.5);
  });

  it("applies no small-order fee once the subtotal clears the minimum", () => {
    expect(cartSmallOrderFee(lines)).toBe(0); // $15 subtotal, well above the $4 minimum
    expect(cartTotal(lines)).toBeCloseTo(cartSubtotal(lines));
  });

  it("flags below-minimum carts", () => {
    const tiny: FoodCartLine = { dishId: "d3", name: "Side", priceUsd: 1.5, quantity: 1, note: "" };
    expect(isBelowMinimumOrder([tiny])).toBe(true);
    expect(isBelowMinimumOrder(lines)).toBe(false);
    expect(isBelowMinimumOrder([])).toBe(false);
  });
});
