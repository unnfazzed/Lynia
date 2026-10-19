import { type CanActivate, type ExecutionContext, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/**
 * Own bikers kill switch (`FLEET_UI_LIVE`, D-117): the same fail-safe-OFF, 503-before-auth shape as
 * RestaurantsEnabledGuard, so a switched-off feature never answers with a route-shaped 401/403/404.
 */
@Injectable()
export class FleetEnabledGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (this.env.FLEET_UI_LIVE !== "true") {
      throw new ServiceUnavailableException("Own bikers is not available yet");
    }
    return true;
  }
}
