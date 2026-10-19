import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  type AdminFleetDetail,
  type AdminFleetRow,
  EnableFleetRequest,
  FleetAdjustRequest,
  FleetAdminActionRequest,
  MarkFleetBillPaidRequest,
  SetFleetFeeRequest,
} from "@lynia/shared";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { FleetAdminService } from "./fleet-admin.service";

/**
 * Own bikers in the console (handoff own-bikers-v1 OB-A1–A3, T7): the fleets table, a fleet's side panel, and the
 * switches and money actions. Same guards as AdminController. Not behind FLEET_UI_LIVE: ops set a fleet up before
 * the merchant and biker screens go live.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminFleetsController {
  constructor(private readonly fleets: FleetAdminService) {}

  /** OB-A1. */
  @Get("fleets")
  list(): Promise<AdminFleetRow[]> {
    return this.fleets.list();
  }

  /** OB-A2. */
  @Get("fleets/:ownerId")
  detail(@Param("ownerId", ParseUUIDPipe) ownerId: string): Promise<AdminFleetDetail> {
    return this.fleets.detail(ownerId);
  }

  /** Switch Own bikers on for this business's owner, with the per-ride fee. */
  @Post("merchants/:id/fleet")
  @HttpCode(200)
  enable(
    @Param("id", ParseUUIDPipe) merchantId: string,
    @Body(new ZodBody(EnableFleetRequest)) body: EnableFleetRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.enable(actor, merchantId, body);
  }

  @Post("fleets/:ownerId/fee")
  @HttpCode(200)
  setFee(
    @Param("ownerId", ParseUUIDPipe) ownerId: string,
    @Body(new ZodBody(SetFleetFeeRequest)) body: SetFleetFeeRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.setFee(actor, ownerId, body);
  }

  /** OB-A3 Pause. */
  @Post("fleets/:ownerId/pause")
  @HttpCode(200)
  pause(
    @Param("ownerId", ParseUUIDPipe) ownerId: string,
    @Body(new ZodBody(FleetAdminActionRequest)) body: FleetAdminActionRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.pause(actor, ownerId, body);
  }

  @Post("fleets/:ownerId/unpause")
  @HttpCode(200)
  unpause(
    @Param("ownerId", ParseUUIDPipe) ownerId: string,
    @Body(new ZodBody(FleetAdminActionRequest)) body: FleetAdminActionRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.unpause(actor, ownerId, body);
  }

  /** OB-A3 Disable. */
  @Post("fleets/:ownerId/disable")
  @HttpCode(200)
  disable(
    @Param("ownerId", ParseUUIDPipe) ownerId: string,
    @Body(new ZodBody(FleetAdminActionRequest)) body: FleetAdminActionRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.disable(actor, ownerId, body);
  }

  /** OB-A2 Adjust. */
  @Post("fleets/:ownerId/adjust")
  @HttpCode(200)
  adjust(
    @Param("ownerId", ParseUUIDPipe) ownerId: string,
    @Body(new ZodBody(FleetAdjustRequest)) body: FleetAdjustRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.adjust(actor, ownerId, body);
  }

  /** OB-A2 Mark paid. */
  @Post("fleets/bills/:id/paid")
  @HttpCode(200)
  markPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(MarkFleetBillPaidRequest)) body: MarkFleetBillPaidRequest,
    @AdminActor() actor: string,
  ): Promise<AdminFleetDetail> {
    return this.fleets.markBillPaid(actor, id, body.note);
  }
}
