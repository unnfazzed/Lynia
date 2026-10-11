/**
 * D7 review (2026-10-07): saving a dish photo or a cover/logo now makes a server-side thumbnail (a
 * storage read, an image decode and a write), so those routes carry a per-caller rate limit.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { MerchantController } from "./merchant.controller";

const throttleOf = (fn: unknown): ThrottleOptions | undefined => Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

describe("MerchantController photo-saving routes are throttled (D7 review)", () => {
  it.each([
    ["createDish", "merchant-dish-create"],
    ["updateDish", "merchant-dish-update"],
    ["updateProfile", "merchant-profile-update"],
  ] as const)("%s", (method, keyPrefix) => {
    const opts = throttleOf(MerchantController.prototype[method]);
    expect(opts?.keyPrefix).toBe(keyPrefix);
    expect(opts!.limit).toBeLessThanOrEqual(30);
    expect(opts!.windowSec).toBe(60);
  });
});
