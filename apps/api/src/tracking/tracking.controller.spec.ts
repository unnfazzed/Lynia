import { RiderLocationEvent } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { TrackingController } from "./tracking.controller";
import type { TrackingGateway } from "./tracking.gateway";

const ORDER = "2f1e9b3c-0000-4000-8000-000000000001";

function controller(assigned: boolean) {
  const ingestRiderFix = vi.fn(async () => assigned);
  return { ctl: new TrackingController({ ingestRiderFix } as unknown as TrackingGateway), ingestRiderFix };
}

describe("JQ-R2-01: POST /orders/:orderId/location — the headless background task's fix", () => {
  it("lands the fix on the same path as the socket event", async () => {
    const { ctl, ingestRiderFix } = controller(true);
    await expect(ctl.location(ORDER, { lat: -17.8, lng: 31.05 }, "rider-1")).resolves.toEqual({ ok: true });
    expect(ingestRiderFix).toHaveBeenCalledWith("rider-1", ORDER, -17.8, 31.05);
  });

  it("403s with a machine reason when the job isn't the caller's active one (the task then stops)", async () => {
    const { ctl } = controller(false);
    await expect(ctl.location(ORDER, { lat: -17.8, lng: 31.05 }, "rider-1")).rejects.toMatchObject({
      status: 403,
      response: { reason: "not_assigned" },
    });
  });

  it("rejects an out-of-range fix before it can reach the gateway (the socket schema's bounds)", () => {
    const pipe = new ZodBody(RiderLocationEvent.omit({ orderId: true }));
    expect(() => pipe.transform({ lat: 999, lng: 31 })).toThrow();
    expect(() => pipe.transform({ lat: -17.8, lng: Number.NaN })).toThrow();
    expect(pipe.transform({ lat: -17.8, lng: 31.05 })).toEqual({ lat: -17.8, lng: 31.05 });
  });

  it("is rate-limited per signed-in biker", () => {
    const meta = Reflect.getMetadata(THROTTLE_KEY, TrackingController.prototype.location) as ThrottleOptions | ThrottleOptions[];
    const rules = Array.isArray(meta) ? meta : [meta];
    expect(rules.map((r) => r.keyPrefix)).toContain("rider-location");
    for (const r of rules) expect(r.key).toBeUndefined();
  });
});
