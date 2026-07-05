import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { RaiseIssueRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
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
