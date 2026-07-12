import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { RaiseSosRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { SosService } from "./sos.service";

/**
 * Raise an SOS on a live trip (R-16/F-13). Guarded at the class level: the raiser is the authenticated
 * caller and their role + the counterparty are derived from the order server-side.
 */
@Controller("orders/:orderId/sos")
@UseGuards(JwtAuthGuard)
export class SosController {
  constructor(private readonly sos: SosService) {}

  // DS-05: each SOS writes a row and fans a push out to ops + the counterparty. Unthrottled it is an
  // alert-flood / push-spam vector. The limit is deliberately generous — a genuine repeat SOS on a
  // real incident must still get through — while blunting a scripted flood.
  @Throttle({ limit: 10, windowSec: 60, keyPrefix: "sos-raise" })
  @Post()
  raise(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RaiseSosRequest)) body: RaiseSosRequest,
    @CurrentUser() callerId: string,
  ) {
    if (body.orderId !== orderId) throw new BadRequestException("orderId in body must match the URL");
    return this.sos.raise(orderId, body, callerId);
  }
}
