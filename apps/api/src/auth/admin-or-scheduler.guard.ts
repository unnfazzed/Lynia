import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { TokenService } from "./token.service";

interface AuthedRequest {
  headers: Record<string, string | undefined>;
  url?: string;
  originalUrl?: string;
  protocol?: string;
  hostname?: string;
  user?: { sub: string; role: string };
}

/** Admin JWT (the console path) OR a Google-signed Cloud Scheduler OIDC identity token (the cron
 *  path — docs/LAUNCH-EXECUTION-RUNBOOK.md §2). JwtAuthGuard alone rejects the scheduler's token
 *  (it verifies only our own HS256 JWTs), which is why the daily retention sweep 401'd; this guard
 *  adds the missing acceptance path without weakening the admin one. The OIDC path is honoured only
 *  when SCHEDULER_SERVICE_ACCOUNT is configured, the token verifies against Google's certs, the
 *  service-account email matches exactly, and the token's audience is this route's own full URL
 *  (scheme + host + path) — so a token minted for one endpoint, or for the same path on a
 *  different host, can never be replayed against another. Trusting `req.protocol`/`req.hostname`
 *  here is safe because `TRUST_PROXY` pins Express to the single documented ALB→Cloud Run hop
 *  (see config/env.ts). */
@Injectable()
export class AdminOrSchedulerGuard implements CanActivate {
  /** Test seam: specs replace this with a stub verifier. */
  oidcClient: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client();

  constructor(
    private readonly tokens: TokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
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
      // A VALID app token with the wrong role is a 403, not an invitation to try the OIDC path.
      if (appTokenValid) throw err;
    }

    // 2) Cloud Scheduler's Google-signed OIDC identity token.
    if (await this.verifySchedulerOidc(token, req)) return true;
    throw new UnauthorizedException("Invalid or expired token");
  }

  private async verifySchedulerOidc(token: string, req: AuthedRequest): Promise<boolean> {
    const allowed = this.env.SCHEDULER_SERVICE_ACCOUNT;
    if (!allowed) return false;
    try {
      // No audience arg: signature/expiry/issuer are verified here, audience is pinned below
      // to the request's own full URL (the scheduler mints its token with audience = the job URI).
      const ticket = await this.oidcClient.verifyIdToken({ idToken: token });
      const claims = ticket.getPayload();
      if (!claims || claims.email !== allowed || claims.email_verified !== true) return false;
      const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
      if (typeof claims.aud !== "string" || !path) return false;
      const aud = new URL(claims.aud);
      const expectedOrigin = `${req.protocol ?? "https"}://${req.hostname ?? ""}`;
      if (aud.pathname !== path || aud.origin !== expectedOrigin) return false;
      req.user = { sub: `scheduler:${allowed}`, role: "admin" };
      return true;
    } catch {
      return false; // not a valid Google-signed token (or an audience that isn't a URL)
    }
  }
}
