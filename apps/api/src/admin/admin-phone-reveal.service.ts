import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { isBusinessBookingAccountPhone } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { auditData } from "./admin.shared";

export const PHONE_REVEAL_AUDIT_ACTION = "person.phone_reveal";

/**
 * Parse `ADMIN_PHONE_REVEAL_OPERATORS` — comma-separated operator emails, compared case-insensitively (the
 * same shape as the console's `ADMIN_CONSOLE_ALLOWED_OPERATORS`). Unset or blank → nobody.
 */
export function parseRevealOperators(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e !== ""),
  );
}

/**
 * Owner 2026-10-18: show one person's full phone number on demand, so the owner can call any customer or biker.
 *
 * A-03 masking stays the default everywhere (lists, detail pages, closed orders). This is the one deliberate
 * exception, and it is narrow:
 *   - Only operators named in `ADMIN_PHONE_REVEAL_OPERATORS` may use it. Unset → nobody (fails closed). The
 *     operator is the console's verified sign-in, forwarded as `X-Operator` (see admin-actor.decorator.ts); the
 *     shared token's own subject is never on the list, so a call without a signed-in operator is refused.
 *   - One person per call, never a list, and every reveal writes a `person.phone_reveal` audit row.
 *   - The route is rate-limited (admin.controller.ts) so it can't be looped into a bulk export.
 */
@Injectable()
export class AdminPhoneRevealService {
  private readonly operators: ReadonlySet<string>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.operators = parseRevealOperators(env.ADMIN_PHONE_REVEAL_OPERATORS);
  }

  /** Whether this operator may reveal numbers (drives the console's "Show number" button). */
  canReveal(actor: string): boolean {
    return this.operators.has(actor.trim().toLowerCase());
  }

  /** The person's full phone number, with an audit row. 403 for anyone off the list, 404 for an unknown id. */
  async reveal(actor: string, profileId: string): Promise<{ phone: string }> {
    if (!this.canReveal(actor)) throw new ForbiddenException("You can't see full phone numbers.");
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { phone: true } });
    if (!profile) throw new NotFoundException("Person not found");
    // A business's booking account holds `business:<id>`, not a number.
    if (isBusinessBookingAccountPhone(profile.phone)) throw new BadRequestException("This account has no phone number.");
    await this.prisma.auditLog.create({ data: auditData(actor, PHONE_REVEAL_AUDIT_ACTION, profileId) });
    return { phone: profile.phone };
  }
}
