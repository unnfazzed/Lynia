import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { REFERRAL_PAY_CAP_USD, ReferralsService } from "../referrals/referrals.service";

// Ops record the cash they paid for one verified friend. The note goes on the audit row.
const ReferralPaid = z.object({
  amount: z.number().positive().max(REFERRAL_PAY_CAP_USD).multipleOf(0.01),
  note: z.string().max(2000).nullish(),
});

/**
 * Biker referrals in the console (owner 2026-10-18, ledger D-112): the Referrals page, a biker's share link,
 * and recording a cash payment. Same guards as AdminController.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /** Every referral with the friend's progress and warnings, the per-biker rollup and the totals. */
  @Get("referrals")
  list() {
    return this.referrals.list();
  }

  /** The biker page's referral card. */
  @Get("riders/:id/referral")
  summary(@Param("id", ParseUUIDPipe) id: string) {
    return this.referrals.summaryFor(id);
  }

  /** Mint (or return) the biker's share code and link. Idempotent: one code per biker, for good. */
  @Post("riders/:id/referral-code")
  code(@Param("id", ParseUUIDPipe) id: string) {
    return this.referrals.codeFor(id);
  }

  /** Record the cash paid for one referral. Once per referral, only for a verified friend; audited. */
  @Post("referrals/:id/paid")
  markPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReferralPaid)) body: z.infer<typeof ReferralPaid>,
    @AdminActor() actor: string,
  ) {
    return this.referrals.markPaid(actor, id, body);
  }
}
