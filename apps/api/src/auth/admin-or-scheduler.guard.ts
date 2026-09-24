import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { type SchedulerRequest, type SchedulerTokenVerifier, schedulerVerifierFor } from "./scheduler-token-verifier";
import { TokenService } from "./token.service";

/** Admin JWT (the console path) OR the scheduler's platform identity token (the cron path —
 *  docs/LAUNCH-EXECUTION-RUNBOOK.md §2). JwtAuthGuard alone rejects the scheduler's token (it
 *  verifies only our own HS256 JWTs), which is why the daily retention sweep 401'd; this guard
 *  adds the missing acceptance path without weakening the admin one. Which scheduler token is
 *  accepted is `SCHEDULER_AUTH`'s choice: a Google-signed Cloud Scheduler OIDC token
 *  (GoogleOidcVerifier) or an Entra managed-identity token (EntraVerifier) — see
 *  scheduler-token-verifier.ts for exactly what each pins. */
@Injectable()
export class AdminOrSchedulerGuard implements CanActivate {
  /** Test seam: specs replace this with a stub or locally-keyed verifier. */
  verifier: SchedulerTokenVerifier;

  constructor(
    private readonly tokens: TokenService,
    @Inject(ENV) env: Env,
  ) {
    this.verifier = schedulerVerifierFor(env);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SchedulerRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);

    // 1) The app's own access token — must be an admin (same contract as JwtAuthGuard + AdminGuard).
    let appTokenValid = false;
    try {
      const user = this.tokens.verifyAccess(token);
      appTokenValid = true;
      if (user.role !== "admin") throw new ForbiddenException("Admin only");
      req.user = user;
      return true;
    } catch (err) {
      // A VALID app token with the wrong role is a 403, not an invitation to try the scheduler path.
      if (appTokenValid) throw err;
    }

    // 2) The scheduler's platform-signed identity token.
    if (await this.verifier.verify(token, req)) return true;
    throw new UnauthorizedException("Invalid or expired token");
  }
}
