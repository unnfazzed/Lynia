import { describe, expect, it } from "vitest";
import {
  CANCEL_STRIKE_LIMIT,
  CUSTOMER_CANCELLABLE,
  FORWARD,
  POST_PICKUP_FOR_UNDELIVERED,
  RIDER_CANCELLABLE,
} from "./order-lifecycle.constants";

describe("order-lifecycle constants (extracted, roadmap 3.4)", () => {
  it("the cancellation matrix encodes the rider post-pickup block (C3/C6)", () => {
    // Rider may cancel up to arrival at pickup, never once the parcel is on the bike.
    expect(RIDER_CANCELLABLE.has("assigned")).toBe(true);
    expect(RIDER_CANCELLABLE.has("en_route_pickup")).toBe(true);
    expect(RIDER_CANCELLABLE.has("picked_up")).toBe(false);
    // Customer may cancel at any live status, pre- or post-pickup.
    expect(CUSTOMER_CANCELLABLE.has("picked_up")).toBe(true);
  });

  it("undelivered is only reachable post-pickup", () => {
    expect([...POST_PICKUP_FOR_UNDELIVERED]).toEqual(["picked_up", "en_route_dropoff"]);
    expect(POST_PICKUP_FOR_UNDELIVERED.has("assigned")).toBe(false);
  });

  it("the forward map chains each rider-driven edge from its prior status", () => {
    expect(FORWARD.confirmed.from).toBe("assigned");
    expect(FORWARD.en_route_pickup.from).toBe("confirmed");
    expect(FORWARD.picked_up.from).toBe("en_route_pickup");
    expect(FORWARD.en_route_dropoff.from).toBe("picked_up");
  });

  it("CANCEL_STRIKE_LIMIT is the T4 no-show threshold", () => {
    expect(CANCEL_STRIKE_LIMIT).toBe(3);
  });
});
