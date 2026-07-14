import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ReportUserRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { ReportsService } from "./reports.service";

/**
 * Report the order counterparty after a trip (A-05 adjacent). Guarded at the class level: the report is
 * attributed to the authenticated caller and the subject is derived from the order server-side, so
 * neither the reporter nor the subject is a spoofable body field.
 */
@Controller("orders/:orderId/report")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Reporting a counterparty INSERTs a row and (like the sibling issue-raise endpoint) can fan out to
  // ops — unthrottled it's the same push-flood / unbounded-row-growth vector the repo caps elsewhere.
  // Mirror the issue-raise cap (10/min per caller-or-IP).
  @Throttle({ limit: 10, windowSec: 60, keyPrefix: "order-report" })
  @Post()
  report(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ReportUserRequest)) body: ReportUserRequest,
    @CurrentUser() callerId: string,
  ) {
    // The path orderId is authoritative; the body carries it too (shared contract) — reject a mismatch
    // rather than silently trusting one over the other.
    if (body.orderId !== orderId) throw new BadRequestException("orderId in body must match the URL");
    return this.reports.report(orderId, body, callerId);
  }
}
