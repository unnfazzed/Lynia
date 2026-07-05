import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { RaiseSosRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
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
