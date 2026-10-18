import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { isBusinessBookingAccountPhone } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";
import { auditData } from "./admin.shared";

export const PHONE_REVEAL_AUDIT_ACTION = "person.phone_reveal";

/**
 * Owner 2026-10-18: show one person's full phone number on demand, so ops can call any customer or biker. Any admin
 * may (owner, same day: "no need to be limited to me or anyone").
 *
 * A-03 masking stays the default everywhere (lists, detail pages, closed orders); this is the deliberate exception:
 *   - One person per call, never a list, and every reveal writes a `person.phone_reveal` audit row naming the
 *     operator (the console's signed-in identity, forwarded as `X-Operator`).
 *   - The route is rate-limited (admin.controller.ts) so it can't be looped into a bulk export.
 */
@Injectable()
export class AdminPhoneRevealService {
  constructor(private readonly prisma: PrismaService) {}

  /** The person's full phone number, with an audit row. 404 for an unknown id. */
  async reveal(actor: string, profileId: string): Promise<{ phone: string }> {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { phone: true } });
    if (!profile) throw new NotFoundException("Person not found");
    // A business's booking account holds `business:<id>`, not a number.
    if (isBusinessBookingAccountPhone(profile.phone)) throw new BadRequestException("This account has no phone number.");
    await this.prisma.auditLog.create({ data: auditData(actor, PHONE_REVEAL_AUDIT_ACTION, profileId) });
    return { phone: profile.phone };
  }
}
