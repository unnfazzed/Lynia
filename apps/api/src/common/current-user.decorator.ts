import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

interface MaybeAuthedRequest {
  headers: Record<string, string | undefined>;
  user?: { sub?: string };
}

/**
 * Resolve the authenticated profile id from a request.
 *
 * Source of truth is the JWT subject set by `JwtAuthGuard` (lane B). Outside production we also
 * accept an `x-user-id` header so local dev and tests can act as a user without minting a JWT.
 * **In production the header is ignored entirely** — identity is only ever the JWT subject — so a
 * spoofed `x-user-id` can never stand in for a real user. Extracted as a pure function so the
 * fallback gating is unit-testable.
 */
export function resolveCurrentUser(req: MaybeAuthedRequest, nodeEnv: string | undefined = process.env.NODE_ENV): string {
  const devFallback = nodeEnv === "production" ? undefined : req.headers["x-user-id"];
  const id = req.user?.sub ?? devFallback;
  if (!id) throw new UnauthorizedException("Not authenticated");
  return id;
}

/**
 * The authenticated profile id. Prefers the JWT subject set by JwtAuthGuard; in non-production
 * falls back to the `x-user-id` header (see {@link resolveCurrentUser}).
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  resolveCurrentUser(ctx.switchToHttp().getRequest<MaybeAuthedRequest>()),
);
