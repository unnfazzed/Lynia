import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/** Requires a merchant JWT (role="merchant", minted after POST /merchant/become). Mirrors AdminGuard
 *  exactly — fail-closed: anything other than an exact role match is refused. Use after
 *  RestaurantsEnabledGuard + JwtAuthGuard, which populate req.user. */
@Injectable()
export class MerchantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (req.user?.role !== "merchant") throw new ForbiddenException("Merchant only");
    return true;
  }
}
