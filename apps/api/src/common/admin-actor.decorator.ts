import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { resolveCurrentUser } from "./current-user.decorator";

interface AdminActorRequest {
  headers: Record<string, string | undefined>;
  user?: { sub?: string };
}

/** An email address ceiling (RFC 5321) — bounds an attacker-influenced header even though these routes
 *  are already admin-token-gated. */
const MAX_OPERATOR_LEN = 320;

/**
 * The actor to attribute an admin action to in the audit log.
 *
 * Every admin route sits behind `AdminGuard`, so only the console's single shared admin token reaches
 * this — its JWT subject is the same service-account id for every human operator, which makes the audit
 * trail useless for accountability. The console's fail-closed middleware asserts the real operator via a
 * trusted identity-aware proxy (IAP) and its server actions forward that identity as the `X-Operator`
 * header. Prefer that real human when present; fall back to the token's own subject when it's absent
 * (the offline/demo path, or a direct token call). Honouring the header only on admin-guarded routes is
 * safe: reaching them at all already requires possession of the admin token. Pure for unit tests.
 */
export function resolveAdminActor(req: AdminActorRequest, nodeEnv?: string): string {
  const operator = req.headers["x-operator"]?.trim();
  if (operator) return operator.slice(0, MAX_OPERATOR_LEN);
  return resolveCurrentUser(req, nodeEnv);
}

export const AdminActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  resolveAdminActor(ctx.switchToHttp().getRequest<AdminActorRequest>()),
);
