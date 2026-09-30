import { describe, expect, it } from "vitest";
import { codAmount, codItem, isCodItem, withoutCodItem } from "./booking-cod";
import { OrderItem } from "./contracts";

describe("a booking's cash-on-delivery line (D-48 PR 4b)", () => {
  it("reads the amount back and is a valid order item", () => {
    const line = codItem(51, "Mbare Auto Spares");
    expect(line.description).toBe("Cash on delivery: collect $51.00 from the buyer, bring it back to Mbare Auto Spares");
    expect(OrderItem.safeParse(line).success).toBe(true);
    expect(isCodItem(line)).toBe(true);
    expect(codAmount([{ description: "Oil filter" }, line])).toBe(51);
    expect(codAmount([{ description: "Oil filter" }])).toBeNull();
    expect(withoutCodItem([{ description: "Oil filter", quantity: 1 }, line])).toEqual([{ description: "Oil filter", quantity: 1 }]);
  });

  it("ignores malformed items rather than throwing", () => {
    expect(codAmount([{} as { description: string }, null as unknown as { description: string }])).toBeNull();
  });

  it("keeps a long shop name inside 140 characters", () => {
    const line = codItem(149.99, "x".repeat(200));
    expect(line.description.length).toBe(140);
    expect(codAmount([line])).toBe(149.99);
  });
});
