import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OTP_STORE, type OtpStore } from "../auth/otp-store";
import { TokenService } from "../auth/token.service";

export interface ThrottleOptions {
  /** Max requests allowed inside the window before a 429. */
  limit: number;
  /** Fixed-window length in seconds. */
  windowSec: number;
  /** Namespaces the counter key so unrelated routes don't share a budget (e.g. "refresh", "order-create"). */
  keyPrefix: string;
}

export const THROTTLE_KEY = "lynia:throttle";

/**
 * Per-route rate limit. Applied on top of the strong OTP-specific limiter that already lives in
 * AuthService — this generalizes that protection to the other sensitive/high-cost routes (refresh,
 * order/offer creation, offer select) which previously had only `JwtAuthGuard` and no request cap.
 *
 * Example: `@Throttle({ limit: 30, windowSec: 60, keyPrefix: "order-create" })`.
 */
export const Throttle = (opts: ThrottleOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLE_KEY, opts);

/**
 * Global guard that enforces `@Throttle(...)` metadata. Registered as an APP_GUARD; routes without the
 * decorator pass straight through (no cost). Backed by the same Redis fixed-window counter
 * (`OtpStore.hit`) the OTP limiter uses, so counts are shared across API instances in prod.
 *
 * Keyed by authenticated SUBJECT when the request carries a valid access token, else client IP.
 *
 * FRAUD P3-5: this global guard runs BEFORE the route's JwtAuthGuard, so `req.user` is still unset here —
 * which previously collapsed EVERY authenticated route's key to the client IP, defeating per-account
 * limits (a NAT'd building shares one budget; a single account behind many IPs dodges it). To key by
 * subject without changing guard ordering, we decode the bearer token ourselves: a valid HS256 access
 * token yields the subject we throttle on; a missing/invalid token falls back to IP (JwtAuthGuard rejects
 * it moments later anyway). Verification here is not authorization — it only derives a stable throttle key.
 * Unauthenticated throttled routes (OTP request, refresh — which carries a refresh token, not a bearer)
 * legitimately have no subject and stay IP-keyed, exactly as before.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OTP_STORE) private readonly store: OtpStore,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: { sub?: string };
      headers?: Record<string, string | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const identity = this.subject(req) ?? req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = `rl:throttle:${opts.keyPrefix}:${identity}`;

    const count = await this.store.hit(key, opts.windowSec);
    if (count > opts.limit) {
      // Same shape AuthService.enforceRate raises for the OTP limiter.
      throw new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  /**
   * The authenticated subject to throttle on: a downstream guard's `req.user` if it already ran, else the
   * subject of a valid bearer access token. Returns undefined when there's no bearer or the token doesn't
   * verify (→ caller falls back to IP). Never throws — a bad token is an IP-keyed request here, and the
   * real 401 is JwtAuthGuard's job on the routes that use it.
   */
  private subject(req: { user?: { sub?: string }; headers?: Record<string, string | undefined> }): string | undefined {
    if (req.user?.sub) return req.user.sub;
    const header = req.headers?.authorization;
    if (!header || !header.startsWith("Bearer ")) return undefined;
    try {
      return this.tokens.verifyAccess(header.slice("Bearer ".length)).sub;
    } catch {
      return undefined;
    }
  }
}
