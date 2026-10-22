import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AdminShopFrontPhotoRequest, AdminUpdateShopFrontRequest } from "@lynia/shared";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { AdminShopFrontService } from "./admin-shop-front.service";

/** Ops editing a business's shop front on its behalf (admin assist). Same guards as AdminController. */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminShopFrontController {
  constructor(private readonly shopFront: AdminShopFrontService) {}

  /** Mint a signed PUT for a logo or cover; send the returned `key` as `logoUrl`/`coverPhotoUrl` below. */
  @Post("merchants/:id/shop-front/photo")
  @HttpCode(200)
  photo(@Param("id", ParseUUIDPipe) merchantId: string, @Body(new ZodBody(AdminShopFrontPhotoRequest)) body: AdminShopFrontPhotoRequest) {
    return this.shopFront.mintPhoto(merchantId, body);
  }

  @Post("merchants/:id/shop-front")
  @HttpCode(200)
  update(
    @Param("id", ParseUUIDPipe) merchantId: string,
    @Body(new ZodBody(AdminUpdateShopFrontRequest)) body: AdminUpdateShopFrontRequest,
    @AdminActor() actor: string,
  ) {
    return this.shopFront.update(actor, merchantId, body);
  }
}
