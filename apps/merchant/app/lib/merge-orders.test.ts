import { describe, expect, it } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { mergeOrders } from "./merge-orders";

function order(id: string, over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse {
  return { id, merchantPhase: "preparing", total: 4, ...over } as unknown as MerchantOrderResponse;
}

describe("mergeOrders (B-O17)", () => {
  it("reuses the previous object reference for an order whose content is unchanged", () => {
    const prevOrder = order("a");
    // A structurally-identical but distinct object, mirroring a fresh JSON deserialize.
    const nextOrder = order("a");
    const merged = mergeOrders([prevOrder], [nextOrder]);
    expect(merged[0]).toBe(prevOrder);
    expect(merged[0]).not.toBe(nextOrder);
  });

  it("uses the new object reference for an order whose content changed", () => {
    const prevOrder = order("a", { merchantPhase: "preparing" });
    const nextOrder = order("a", { merchantPhase: "ready_for_pickup" });
    const merged = mergeOrders([prevOrder], [nextOrder]);
    expect(merged[0]).toBe(nextOrder);
    expect(merged[0]).not.toBe(prevOrder);
  });

  it("uses the new object reference for an order id not seen before", () => {
    const nextOrder = order("b");
    const merged = mergeOrders([order("a")], [nextOrder]);
    expect(merged[0]).toBe(nextOrder);
  });

  it("drops an order no longer present in the next snapshot", () => {
    const merged = mergeOrders([order("a"), order("b")], [order("b")]);
    expect(merged.map((o) => o.id)).toEqual(["b"]);
  });

  it("preserves the next snapshot's order", () => {
    const merged = mergeOrders([order("a"), order("b")], [order("b"), order("a")]);
    expect(merged.map((o) => o.id)).toEqual(["b", "a"]);
  });
});
