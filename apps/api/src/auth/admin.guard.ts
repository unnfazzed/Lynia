import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/** Requires an admin JWT. Use after JwtAuthGuard, which populates req.user. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (req.user?.role !== "admin") throw new ForbiddenException("Admin only");
    return true;
  }
}
