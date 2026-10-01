import { type CanActivate, type ExecutionContext, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { shopServiceEnabled } from "./merchant-lookup.util";

/**
 * Fail-safe-OFF kill switch for the Shops & Pharmacy read routes (ledger D-58), the twin of
 * RestaurantsEnabledGuard: it runs FIRST, ahead of JwtAuthGuard, so with both sections off every route
 * answers 503 — never a route-shaped 401/404 that leaks "this exists, just not for you". Which section
 * a request may read is narrowed further in ShopsController.
 */
@Injectable()
export class ShopsEnabledGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (!shopServiceEnabled(this.env)) throw new ServiceUnavailableException("Shops is not available yet");
    return true;
  }
}
