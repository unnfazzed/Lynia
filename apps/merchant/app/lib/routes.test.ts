import { describe, expect, it } from "vitest";
import { bookingHref, handoverHref, legacyHref, orderHref, prescriptionHref } from "./routes";

describe("routes", () => {
  it("puts the id in the query string", () => {
    expect(orderHref("o1")).toBe("/queue/order?id=o1");
    expect(prescriptionHref("o1")).toBe("/queue/rx?id=o1");
    expect(bookingHref("b1")).toBe("/deliveries/booking?id=b1");
    expect(handoverHref("a.b.c")).toBe("/h?t=a.b.c");
  });

  it("forwards the old path-style links to the same page", () => {
    expect(legacyHref("/queue/o1")).toBe("/queue/order?id=o1");
    expect(legacyHref("/queue/o1/")).toBe("/queue/order?id=o1");
    expect(legacyHref("/queue/o1/rx")).toBe("/queue/rx?id=o1");
    expect(legacyHref("/deliveries/b1")).toBe("/deliveries/booking?id=b1");
    expect(legacyHref("/h/a.b.c")).toBe("/h?t=a.b.c");
  });

  it("leaves everything else alone", () => {
    for (const p of ["/", "/queue", "/queue/order", "/queue/rx", "/deliveries/new", "/deliveries/booking", "/menu/x", "/queue/a/b"]) {
      expect(legacyHref(p)).toBeNull();
    }
  });
});
