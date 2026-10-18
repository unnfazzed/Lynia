import { Module } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";

/** Biker referrals (ledger D-112): the become route attaches a code, the admin console reads and pays. */
@Module({
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
