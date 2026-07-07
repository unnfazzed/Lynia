import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ResolveIssueRequest } from "@lynia/shared";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { IssuesService } from "./issues.service";

/**
 * Ops disputes console (A-05). Admin-only: the queue, the per-issue evidence detail, and the resolve
 * action (which applies the resolution side-effect + writes an audit row in one transaction).
 */
@Controller("admin/issues")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminIssuesController {
  constructor(private readonly issues: IssuesService) {}

  /** Disputes queue, newest first. `?status=open|investigating|resolved` filters; unknown values ignored. */
  @Get()
  list(@Query("status") status?: string) {
    return this.issues.listForAdmin(status);
  }

  /** Per-issue detail incl. the order evidence + masked phones. 404s when not found. */
  @Get(":id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    const detail = await this.issues.detailForAdmin(id);
    if (!detail) throw new NotFoundException("Issue not found");
    return detail;
  }

  /** Resolve an issue (refund / rider_strike / close_no_action) — side-effect + audit in one $transaction. */
  @Post(":id/resolve")
  resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ResolveIssueRequest)) body: ResolveIssueRequest,
    @AdminActor() actor: string,
  ) {
    return this.issues.resolve(actor, id, body);
  }
}
