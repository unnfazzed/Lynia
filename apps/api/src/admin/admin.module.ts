import { Module } from "@nestjs/common";
import { SettlementsModule } from "../settlements/settlements.module";
import { SosModule } from "../sos/sos.module";
import { TrackingModule } from "../tracking/tracking.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminController } from "./admin.controller";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminRidersService } from "./admin-riders.service";
import { AdminService } from "./admin.service";

@Module({
  // SettlementsModule exports SettlementsService — the admin cash endpoints delegate to it (A-06).
  // TrackingModule exports TrackingGateway — admin cancelOrder pushes job:cancelled to the assigned rider (P2-3).
  // SosModule exports SosService — the admin SOS list surface reads recent events (DS13-05).
  // WalletModule exports WalletService — the admin manual-credit path for the commission wallet.
  imports: [SettlementsModule, TrackingModule, SosModule, WalletModule],
  controllers: [AdminController],
  providers: [AdminService, AdminOrdersService, AdminRidersService, AdminCustomersService, AdminAuditService],
})
export class AdminModule {}
