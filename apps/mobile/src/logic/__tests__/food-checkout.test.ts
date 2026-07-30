import { canCancelFreely, estimateDeliveryFee, isStillUnpaidReminderDue, STILL_UNPAID_REMINDER_MS } from "../food-checkout";

describe("estimateDeliveryFee", () => {
  it("returns null when the merchant has no location yet", () => {
    expect(estimateDeliveryFee(null, { lat: -17.82, lng: 31.05 })).toBeNull();
  });

  it("mirrors the server's own haversineKm + deliveryFeeForDistance computation", () => {
    // Same two points food-order.service.spec.ts's own fixtures use — ~1.1km apart in Harare.
    const merchant = { lat: -17.8292, lng: 31.0522 };
    const dropoff = { lat: -17.8200, lng: 31.0500 };
    const fee = estimateDeliveryFee(merchant, dropoff);
    expect(fee).not.toBeNull();
    expect(fee).toBeGreaterThanOrEqual(1.5); // N-01's floor
  });

  it("never goes below the N-01 minimum for a near-zero distance", () => {
    const point = { lat: -17.8292, lng: 31.0522 };
    expect(estimateDeliveryFee(point, point)).toBe(1.5);
  });
});

describe("canCancelFreely", () => {
  it("allows a free cancel while awaiting accept, item approval, or payment", () => {
    expect(canCancelFreely("awaiting_accept")).toBe(true);
    expect(canCancelFreely("awaiting_item_approval")).toBe(true);
    expect(canCancelFreely("awaiting_payment")).toBe(true);
  });

  it("blocks a free cancel once the kitchen has started (preparing/ready_for_pickup)", () => {
    expect(canCancelFreely("preparing")).toBe(false);
    expect(canCancelFreely("ready_for_pickup")).toBe(false);
  });

  it("blocks a free cancel with no phase (order handed off / terminal)", () => {
    expect(canCancelFreely(null)).toBe(false);
  });
});

describe("isStillUnpaidReminderDue", () => {
  const now = Date.parse("2026-07-30T12:00:00Z");

  it("is not due with no payment request yet", () => {
    expect(isStillUnpaidReminderDue(null, now)).toBe(false);
  });

  it("is not due just under the N-22 window", () => {
    const requestedAt = new Date(now - (STILL_UNPAID_REMINDER_MS - 1000)).toISOString();
    expect(isStillUnpaidReminderDue(requestedAt, now)).toBe(false);
  });

  it("is due once the N-22 window has fully elapsed", () => {
    const requestedAt = new Date(now - STILL_UNPAID_REMINDER_MS).toISOString();
    expect(isStillUnpaidReminderDue(requestedAt, now)).toBe(true);
  });
});
