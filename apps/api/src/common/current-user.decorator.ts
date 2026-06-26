import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

interface MaybeAuthedRequest {
  headers: Record<string, string | undefined>;
  user?: { sub?: string };
}

/**
 * The authenticated profile id. Prefers the JWT subject set by JwtAuthGuard (lane B);
 * falls back to the `x-user-id` header for routes not yet behind the guard.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<MaybeAuthedRequest>();
  const id = req.user?.sub ?? req.headers["x-user-id"];
  if (!id) throw new UnauthorizedException("Not authenticated");
  return id;
});
