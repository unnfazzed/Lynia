import { Controller, ForbiddenException, Get, ParseFloatPipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { type NearbyRider, TrackingService } from "./tracking.service";

@Controller("riders")
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** Nearby online riders for a broadcast point (ET6). radius in metres, default 3km. Board-eligible
   *  riders only — otherwise any authenticated customer could sweep coordinates to enumerate online
   *  riders and their approximate positions (a privacy/safety leak). */
  @Get("nearby")
  async nearby(
    @Query("lat", ParseFloatPipe) lat: number,
    @Query("lng", ParseFloatPipe) lng: number,
    @CurrentUser() callerId: string,
    @Query("radius") radius?: string,
  ): Promise<NearbyRider[]> {
    if (!(await this.tracking.isBoardEligible(callerId))) throw new ForbiddenException("Riders only");
    const r = radius ? Number(radius) : 3000;
    return this.tracking.nearbyRiders(lat, lng, Number.isFinite(r) ? r : 3000);
  }
}
