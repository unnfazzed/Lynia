import { Module } from "@nestjs/common";
import { ReferralsModule } from "../referrals/referrals.module";
import { SettlementsModule } from "../settlements/settlements.module";
import { SosModule } from "../sos/sos.module";
import { TrackingModule } from "../tracking/tracking.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminAuditReadService } from "./admin-audit-read.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminController } from "./admin.controller";
import { AdminReferralsController } from "./admin-referrals.controller";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminKitchenService } from "./admin-kitchen.service";
import { AdminKycReviewService } from "./admin-kyc-review.service";
import { AdminLiveService } from "./admin-live.service";
import { AdminMerchantApplicationService } from "./admin-merchant-application.service";
import { AdminMerchantsService } from "./admin-merchants.service";
import { AdminMoneyService } from "./admin-money.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminPhoneRevealService } from "./admin-phone-reveal.service";
import { AdminRidersService } from "./admin-riders.service";
import { AdminSearchService } from "./admin-search.service";
import { AdminTimelineService } from "./admin-timeline.service";
import { AdminService } from "./admin.service";

@Module({
  // SettlementsModule exports SettlementsService — the admin cash endpoints delegate to it (A-06).
  // TrackingModule exports TrackingGateway — admin cancelOrder pushes job:cancelled to the assigned rider (P2-3) —
  // and TrackingService, whose last-known positions the live map reads (console v2 §7).
  // SosModule exports SosService — the admin SOS list surface reads recent events (DS13-05).
  // WalletModule exports WalletService — the admin manual-credit path for the commission wallet.
  // ReferralsModule exports ReferralsService — the Referrals page and its cash payments (D-112).
  imports: [SettlementsModule, TrackingModule, SosModule, WalletModule, ReferralsModule],
  controllers: [AdminController, AdminReferralsController],
  providers: [
    AdminService,
    AdminOrdersService,
    AdminRidersService,
    AdminKycReviewService,
    AdminCustomersService,
    AdminMerchantsService,
    AdminMerchantApplicationService,
    AdminKitchenService,
    AdminAuditService,
    AdminAuditReadService,
    AdminSearchService,
    AdminTimelineService,
    AdminMoneyService,
    AdminPeopleService,
    AdminPhoneRevealService,
    AdminLiveService,
  ],
})
export class AdminModule {}
