import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { type MerchantAccess, resolveMerchantAccess } from "./merchant-access";

const OWNER_ONLY = "lynia:merchant-owner-only";

/** Marks a merchant route owner-only — a ❌ row of the Staff column in the permission table
 *  (docs/designs/merchant-web-upgrade.md L4). A staff member gets 403 `{reason:"owner_only"}`. */
export const OwnerOnly = (): MethodDecorator & ClassDecorator => SetMetadata(OWNER_ONLY, true);

export interface MerchantAccessRequest {
  user?: { sub?: string; role?: string };
  merchantAccess?: MerchantAccess;
}

/**
 * Requires the caller to be ON a business — a `merchant_members` row, resolved per request
 * (docs/plans/2026-09-29-merchant-web-upgrade-plan.md D2). The JWT `role` claim is deliberately NOT
 * read: it lags a change by up to the token's 15 minutes, and `become` no longer writes it (RCA
 * 2026-08-18 C-1/C-2/C-4). So a new owner is let in on their very next request, and a removed member
 * is refused on theirs. Fail-closed: no resolvable member → 403. Use after RestaurantsEnabledGuard +
 * JwtAuthGuard, which populate `req.user`. The resolved access is left on `req.merchantAccess`.
 */
@Injectable()
export class MerchantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MerchantAccessRequest>();
    const profileId = req.user?.sub;
    const access = profileId ? await resolveMerchantAccess(this.prisma, profileId) : null;
    if (!access) {
      throw new ForbiddenException({ reason: "not_a_member", message: "This number isn't on a business on LyniaGo yet." });
    }
    const ownerOnly = this.reflector.getAllAndOverride<boolean | undefined>(OWNER_ONLY, [ctx.getHandler(), ctx.getClass()]);
    if (ownerOnly && access.role !== "owner") {
      throw new ForbiddenException({ reason: "owner_only", message: "Only the owner can change this." });
    }
    req.merchantAccess = access;
    return true;
  }
}
