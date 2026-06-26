import { Controller, Get, ParseFloatPipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { type NearbyRider, TrackingService } from "./tracking.service";

@Controller("riders")
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** Nearby online riders for a broadcast point (ET6). radius in metres, default 3km. */
  @Get("nearby")
  nearby(
    @Query("lat", ParseFloatPipe) lat: number,
    @Query("lng", ParseFloatPipe) lng: number,
    @Query("radius") radius?: string,
  ): Promise<NearbyRider[]> {
    const r = radius ? Number(radius) : 3000;
    return this.tracking.nearbyRiders(lat, lng, Number.isFinite(r) ? r : 3000);
  }
}
