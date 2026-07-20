import { describe, expect, it } from "vitest";
import {
  CANCEL_STRIKE_LIMIT,
  connectionFromUrl,
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

  it("connectionFromUrl parses an ioredis connection with maxRetriesPerRequest null (BullMQ requirement)", () => {
    const c = connectionFromUrl("redis://user:pass@host.example:6380");
    expect(c).toMatchObject({ host: "host.example", port: 6380, username: "user", password: "pass", maxRetriesPerRequest: null });
    // Default port when absent.
    expect(connectionFromUrl("redis://localhost").port).toBe(6379);
  });
});
