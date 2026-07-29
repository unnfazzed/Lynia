import { type CanActivate, type ExecutionContext, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/**
 * Fail-safe-OFF kill switch for every Restaurants-vertical route (plan §5 Lane C). Runs FIRST in
 * every merchant/restaurant controller's guard chain — ahead of JwtAuthGuard/MerchantGuard — so a
 * disabled vertical rejects before any auth check, the same "dead means dead" shape the golden
 * matrix (merchant-routes-dead.e2e.spec.ts) asserts: 503, never a route-shaped 401/403/404 that
 * would leak "this endpoint exists, just not for you".
 *
 * `=== "true"` mirrors HealthController.featureFlags — absent and explicitly "false" are the same
 * off state by construction, so there's no way to half-configure this on.
 */
@Injectable()
export class RestaurantsEnabledGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (this.env.RESTAURANTS_ENABLED !== "true") {
      throw new ServiceUnavailableException("Restaurants is not available yet");
    }
    return true;
  }
}
