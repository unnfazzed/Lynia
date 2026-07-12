import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { RaiseIssueRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { IssuesService } from "./issues.service";

/**
 * Party-facing "get help with this trip" (A-05). Guarded at the class level: the issue is attributed to
 * the authenticated caller and the counterparty is derived from the order server-side.
 */
@Controller("orders/:orderId/issues")
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  // FRAUD P1-5 (confirmed still-open): raising an issue INSERTs a row and fans a push out to every
  // admin device token, with no per-order dedup/cap. Unthrottled it is an ops push-flood + unbounded-
  // row-growth vector (the same amplification class the repo throttles for order-create / notify-me).
  // Matches the sos-raise cap.
  @Throttle({ limit: 10, windowSec: 60, keyPrefix: "issue-raise" })
  @Post()
  raise(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RaiseIssueRequest)) body: RaiseIssueRequest,
    @CurrentUser() callerId: string,
  ) {
    if (body.orderId !== orderId) throw new BadRequestException("orderId in body must match the URL");
    return this.issues.raise(orderId, body, callerId);
  }
}
