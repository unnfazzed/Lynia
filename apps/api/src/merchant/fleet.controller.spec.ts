/**
 * Own bikers (D-117): the routes' access rules, pinned so they can't quietly loosen. Inviting, revoking, removing
 * and dismissing are owner-only (E4, E6); everything sits behind the FLEET_UI_LIVE switch; the link-opening and
 * Join routes are throttled (a code is a secret).
 */
import "reflect-metadata";
import { ServiceUnavailableException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { FleetEnabledGuard } from "./fleet-enabled.guard";
import { MerchantFleetController, RiderFleetController } from "./fleet.controller";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

const OWNER_ONLY = "lynia:merchant-owner-only";
const ownerOnly = (fn: unknown) => Reflect.getMetadata(OWNER_ONLY, fn as object) === true;
const throttleOf = (fn: unknown) => Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;
const guardsOf = (cls: object) => (Reflect.getMetadata(GUARDS_METADATA, cls) as unknown[]) ?? [];

describe("Own bikers routes", () => {
  it("put the merchant vertical's switch, then FLEET_UI_LIVE, ahead of auth on both controllers", () => {
    for (const cls of [MerchantFleetController, RiderFleetController]) {
      expect(guardsOf(cls).slice(0, 2)).toEqual([RestaurantsEnabledGuard, FleetEnabledGuard]);
    }
  });

  it("keep invite, link, revoke, remove and dismiss owner-only, and leave the roster readable by staff", () => {
    const p = MerchantFleetController.prototype;
    for (const fn of [p.invite, p.link, p.revoke, p.remove, p.dismissSuggestions]) expect(ownerOnly(fn)).toBe(true);
    expect(ownerOnly(p.roster)).toBe(false);
  });

  it("throttle invite creation, link opening and Join", () => {
    expect(throttleOf(MerchantFleetController.prototype.invite)?.keyPrefix).toBe("merchant-fleet-invite");
    expect(throttleOf(RiderFleetController.prototype.open)).toMatchObject({ keyPrefix: "fleet-invite-open", limit: 10, windowSec: 60 });
    expect(throttleOf(RiderFleetController.prototype.join)?.keyPrefix).toBe("fleet-invite-join");
  });

  it("let any member book, retry and send to any biker (bookings are the team's, plan D3), throttling the creates", () => {
    const p = MerchantFleetController.prototype;
    for (const fn of [p.book, p.retry, p.anyBiker]) expect(ownerOnly(fn)).toBe(false);
    expect(throttleOf(p.book)?.keyPrefix).toBe("merchant-booking-create");
    expect(throttleOf(p.anyBiker)?.keyPrefix).toBe("merchant-booking-create");
    expect(throttleOf(RiderFleetController.prototype.accept)?.keyPrefix).toBe("fleet-job-accept");
  });

  it("503 every route while FLEET_UI_LIVE is off, and let them through when it is on", () => {
    const ctx = {} as never;
    expect(() => new FleetEnabledGuard({ FLEET_UI_LIVE: "false" } as Env).canActivate(ctx)).toThrow(ServiceUnavailableException);
    expect(new FleetEnabledGuard({ FLEET_UI_LIVE: "true" } as Env).canActivate(ctx)).toBe(true);
  });
});
