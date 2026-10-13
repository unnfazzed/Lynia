import { describe, expect, it } from "vitest";
import { cancelAttribution, cancelStageOf, normaliseReasonCode } from "./cancel-attribution";

describe("cancelAttribution (admin console v2 §3)", () => {
  it.each([
    // by, status, merchantPhase, reasonCode → role, stage, code
    ["customer", "open_for_offers", null, "changed my mind", "customer", "open_for_offers", null],
    ["customer", "assigned", undefined, undefined, "customer", "assigned", null],
    ["rider", "en_route_pickup", null, null, "rider", "en_route_pickup", null],
    ["admin", "picked_up", null, "customer_request", "admin", "picked_up", "customer_request"],
    ["admin", "requested", "awaiting_payment", "fraud", "admin", "awaiting_payment", "fraud"],
    ["merchant", "requested", "awaiting_accept", "too_busy", "merchant", "awaiting_accept", "too_busy"],
    ["merchant", "requested", "ready_for_pickup", "no_rider", "merchant", "ready_for_pickup", "no_rider"],
    // A merchant phase only names the stage while the order is pre-dispatch (`requested`).
    ["merchant", "open_for_offers", "preparing", "ran_out", "merchant", "open_for_offers", "ran_out"],
    ["system", "requested", "awaiting_accept", "shop_closed", "system", "awaiting_accept", "shop_closed"],
    // A system cancel with nothing more specific is a timeout.
    ["system", "open_for_offers", null, null, "system", "open_for_offers", "timeout"],
  ] as const)("%s at %s/%s (%s) → %s · %s · %s", (by, status, merchantPhase, reasonCode, role, stage, code) => {
    expect(cancelAttribution({ by, status, merchantPhase, reasonCode })).toEqual({
      cancelledByRole: role,
      cancelStage: stage,
      cancelReasonCode: code,
    });
  });

  it("keeps free text out of the code column", () => {
    expect(normaliseReasonCode("Customer asked ops to cancel")).toBeNull();
    expect(normaliseReasonCode("  ")).toBeNull();
    expect(normaliseReasonCode("x".repeat(65))).toBeNull();
    expect(normaliseReasonCode(" all_out_of_stock ")).toBe("all_out_of_stock");
  });

  it("stage is the status unless a pre-dispatch merchant phase is known", () => {
    expect(cancelStageOf("requested")).toBe("requested");
    expect(cancelStageOf("requested", "preparing")).toBe("preparing");
    expect(cancelStageOf("assigned", "preparing")).toBe("assigned");
  });
});
