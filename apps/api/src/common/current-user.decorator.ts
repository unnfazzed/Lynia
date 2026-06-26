import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

/**
 * Placeholder identity until lane B (auth) lands: reads `x-user-id`.
 * Lane B replaces this with the JWT-derived profile id without changing call sites.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
  const id = req.headers["x-user-id"];
  if (!id) throw new UnauthorizedException("Missing x-user-id (placeholder auth until lane B)");
  return id;
});
