import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { OrdersService } from "../orders/orders.service";

/**
 * Wave-2 W1 — the BFF-style cold-start aggregate (the DoorDash "better API design" lesson: collapse
 * a client-orchestrated call chain into one round trip; their order-detail aggregation took P99 from
 * >2s to <100ms). A signed-in cold start used to burn separate metered round-trips — `/auth/me` plus
 * the role-appropriate active-order read (plus the public version-gate probe) — each paying ~300-600ms
 * of RTT on the target network before the home screen was truthful.
 *
 * One authenticated GET now returns everything the boot path needs; the app seeds its React Query
 * cache from it, so every existing screen/hook keeps working unchanged (the individual endpoints
 * stay for old clients and per-screen revalidation). Composition rules:
 *  - `Promise.all` over the EXACT service methods the individual endpoints call — no new query
 *    logic, no drift risk. Both active reads run (each is one indexed findFirst; the off-role one
 *    is a fast miss) and the role picks which one ships, so the handler adds no serial hop.
 *  - `minSupportedVersion` rides along (same env read as /app/version-gate) so a future client can
 *    drop the separate probe; the public unauthenticated endpoint remains the gate's source of truth.
 *  - Cache semantics: inherits the global `private, no-cache` + weak-ETag contract, so an unchanged
 *    boot revalidates to an empty 304 like every other GET.
 */
@Controller("app")
@UseGuards(JwtAuthGuard)
export class AppBootstrapController {
  constructor(
    private readonly auth: AuthService,
    private readonly orders: OrdersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("bootstrap")
  async bootstrap(@CurrentUser() profileId: string) {
    const [me, riderActive, customerActiveList] = await Promise.all([
      this.auth.getProfile(profileId),
      this.orders.activeForRider(profileId),
      this.orders.activeOrdersForCustomer(profileId),
    ]);
    return {
      minSupportedVersion: this.env.MIN_SUPPORTED_APP_VERSION,
      me,
      // Role-appropriate active order/job, in the same snapshot shape the /orders/mine endpoints
      // serve — the client seeds ["activeJob"] or ["activeCustomerOrder"] from it by `me.role`.
      // The customer value is derived from the list read so the aggregate stays one findMany, not a
      // findMany + a redundant findFirst. `activeForCustomer` equivalence: same customer scope, same
      // newest-updatedAt order; the one row class the LIST adds beyond CUSTOMER_ACTIVE_STATUSES is a
      // food order still with the kitchen (status `requested`), which the find() skips — so old
      // clients (and send.tsx's parcel restore) keep the exact rows they always got.
      activeOrder: me.role === "rider" ? riderActive : (customerActiveList.find((o) => o.status !== "requested") ?? null),
      // RC.home multi-card alignment: every live customer order, newest first, in the same snapshot
      // shape as /orders/mine/active-orders — the client seeds ["activeCustomerOrders"] from it.
      // Additive: old clients keep reading `activeOrder`.
      activeOrders: me.role === "rider" ? [] : customerActiveList,
    };
  }
}
