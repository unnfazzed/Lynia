import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { KycStatus, OrderStatus } from "@lynia/shared";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";

const KYC_VALUES = Object.values(KycStatus) as string[];
const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  /** Rider roster / KYC review queue. `?kyc=pending|verified|failed` filters; unknown values are ignored. */
  @Get("riders")
  riders(@Query("kyc") kyc?: string) {
    const filter = kyc && KYC_VALUES.includes(kyc) ? (kyc as KycStatus) : undefined;
    return this.admin.listRiders(filter);
  }

  /** Order monitor. `?status=<OrderStatus>` filters; unknown values are ignored. */
  @Get("orders")
  orders(@Query("status") status?: string) {
    const filter = status && ORDER_STATUS_VALUES.includes(status) ? (status as OrderStatus) : undefined;
    return this.admin.listOrders(filter);
  }
}
