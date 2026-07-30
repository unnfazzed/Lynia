import { describe, expect, it } from "vitest";
import type { MerchantOrderItemView } from "@lynia/shared";
import { computeAcceptPreview } from "./accept-preview";

const items: MerchantOrderItemView[] = [
  { dishId: "d1", name: "Sadza & Chicken", priceUsd: 5, quantity: 2, note: null, available: null },
  { dishId: "d2", name: "Muriwo", priceUsd: 3, quantity: 1, note: null, available: null },
];

describe("computeAcceptPreview", () => {
  it("full total with nothing marked unavailable", () => {
    const res = computeAcceptPreview(items, new Set());
    expect(res).toEqual({ total: 13, fullTotal: 13, hasUnavailable: false });
  });

  it("excludes a marked-unavailable dish's line from the recomputed total", () => {
    const res = computeAcceptPreview(items, new Set(["d2"]));
    expect(res).toEqual({ total: 10, fullTotal: 13, hasUnavailable: true });
  });

  it("excludes multiple lines and floors at zero of nothing survives", () => {
    const res = computeAcceptPreview(items, new Set(["d1", "d2"]));
    expect(res).toEqual({ total: 0, fullTotal: 13, hasUnavailable: true });
  });

  it("a dishId with no match in the set is untouched", () => {
    const res = computeAcceptPreview(items, new Set(["not-a-real-id"]));
    expect(res.total).toBe(13);
  });
});
