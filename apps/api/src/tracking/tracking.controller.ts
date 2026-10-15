import { Body, Controller, ForbiddenException, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { RiderLocationEvent } from "@lynia/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { TrackingGateway } from "./tracking.gateway";

// The socket event's own bounds, minus the orderId the route carries. Local, like the lifecycle
// controller's rider-only bodies: an additive endpoint old clients never call.
const RiderFixRequest = RiderLocationEvent.omit({ orderId: true });

/**
 * JQ-R2-01: the REST sibling of the `rider:location` socket event. When the OS kills the app mid-job,
 * the Android foreground service lives on and the background task runs headless — no React tree, no
 * socket — so it posts its fix here instead of dropping it. Same authority (the order's assigned rider,
 * active statuses only) and the same emit + persist path as the socket.
 */
@Controller("orders/:orderId")
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly gateway: TrackingGateway) {}

  @Post("location")
  // Fixes arrive every ~10 s; 30/min leaves room for an OS batch flush without letting a loop flood.
  @Throttle({ limit: 30, windowSec: 60, keyPrefix: "rider-location" })
  async location(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RiderFixRequest)) body: z.infer<typeof RiderFixRequest>,
    @CurrentUser() riderId: string,
  ): Promise<{ ok: true }> {
    if (!(await this.gateway.ingestRiderFix(riderId, orderId, body.lat, body.lng))) {
      throw new ForbiddenException({ reason: "not_assigned", message: "This job isn't active for you" });
    }
    return { ok: true };
  }
}
