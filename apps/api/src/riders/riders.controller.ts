import { Body, Controller, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RiderService } from "./rider.service";

const CompleteProfile = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  idNumber: z.string().min(4).max(40),
});
const BecomeRider = z.object({
  bikeReg: z.string().min(3).max(20),
  photoUrl: z.string().url(),
});
const SetOnline = z.object({ online: z.boolean() });

@Controller("riders")
@UseGuards(JwtAuthGuard)
export class RidersController {
  constructor(private readonly riders: RiderService) {}

  @Patch("profile")
  complete(@Body(new ZodBody(CompleteProfile)) body: z.infer<typeof CompleteProfile>, @CurrentUser() id: string) {
    return this.riders.completeProfile(id, body);
  }

  @Post("become")
  become(@Body(new ZodBody(BecomeRider)) body: z.infer<typeof BecomeRider>, @CurrentUser() id: string) {
    return this.riders.becomeRider(id, body);
  }

  @Patch("online")
  online(@Body(new ZodBody(SetOnline)) body: z.infer<typeof SetOnline>, @CurrentUser() id: string) {
    return this.riders.setOnline(id, body.online);
  }
}
