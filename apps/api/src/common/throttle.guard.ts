import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OTP_STORE, type OtpStore } from "../auth/otp-store";
import { TokenService } from "../auth/token.service";
import { MetricsService } from "../observability/metrics.service";

export interface ThrottleOptions {
  /** Max requests allowed inside the window before a 429. */
  limit: number;
  /** Fixed-window length in seconds. */
  windowSec: number;
  /** Namespaces the counter key so unrelated routes don't share a budget (e.g. "refresh", "order-create"). */
  keyPrefix: string;
  /**
   * Derives the counter identity from the request instead of subject/IP — e.g. the phone a code check
   * is for. Returning undefined skips THIS rule for the request (the route's other rules still bind).
   * Runs before the body pipes, so it sees the raw body and must tolerate any shape.
   */
  key?: (req: ThrottleRequest) => string | undefined;
}

/** The slice of the HTTP request the guard reads. */
export interface ThrottleRequest {
  user?: { sub?: string };
  headers?: Record<string, string | undefined>;
  body?: unknown;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/** A `key` for a rule that stays per client IP even when the caller presents a valid bearer. */
export const byIp = (req: ThrottleRequest): string => req.ip ?? req.socket?.remoteAddress ?? "unknown";

export const THROTTLE_KEY = "lynia:throttle";

/**
 * Per-route rate limit. Applied on top of the strong OTP-specific limiter that already lives in
 * AuthService — this generalizes that protection to the other sensitive/high-cost routes (refresh,
 * order/offer creation, offer select) which previously had only `JwtAuthGuard` and no request cap.
 *
 * Example: `@Throttle({ limit: 30, windowSec: 60, keyPrefix: "order-create" })`. Several rules may be
 * given; each keeps its own counter and a request must pass all of them (e.g. a tight per-phone cap
 * plus a loose per-IP ceiling).
 */
export const Throttle = (...opts: ThrottleOptions[]): MethodDecorator & ClassDecorator =>
  // A single rule stays stored as a bare object (the shape every route spec reads back).
  SetMetadata(THROTTLE_KEY, opts.length === 1 ? opts[0] : opts);

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
 * Unauthenticated throttled routes legitimately have no subject; rather than share one IP budget across
 * a carrier NAT, they key their rules on what the request is about (`key` — the phone for a code check,
 * the session for a refresh) with a looser per-IP ceiling beside it.
 *
 * LC-D19: the counter store FAILS OPEN. A Redis error on `hit` (outage, Memorystore blip, the ~2s
 * REDIS_FAIL_FAST bound) used to propagate out of this APP_GUARD and 500 every `@Throttle` route —
 * including SOS raise. Rate limiting is a degradable protection, so a store error now logs a warning,
 * counts `throttle_store_errors_total`, and skips that rule un-counted, matching every other Redis
 * consumer here (micro-cache L2, tracking geo, presence). Only this generic counting degrades: the OTP
 * code store and verify path (AuthService, incl. its own `enforceRate`) call the store directly and keep
 * failing closed — an OTP can't be verified without Redis.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(OTP_STORE) private readonly store: OtpStore,
    private readonly tokens: TokenService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ThrottleOptions | ThrottleOptions[] | undefined>(THROTTLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return true;
    const rules = Array.isArray(meta) ? meta : [meta];

    const req = ctx.switchToHttp().getRequest<ThrottleRequest>();
    for (const opts of rules) {
      const identity = opts.key ? opts.key(req) : (this.subject(req) ?? byIp(req));
      if (identity === undefined) continue;
      let count: number;
      try {
        count = await this.store.hit(`rl:throttle:${opts.keyPrefix}:${identity}`, opts.windowSec);
      } catch (err) {
        // Fail open (LC-D19). Never log the key — it carries a subject id, phone or client IP.
        this.logger.warn(`throttle store unavailable, failing open (${opts.keyPrefix}): ${(err as Error).message}`);
        this.metrics?.recordThrottleStoreError(opts.keyPrefix);
        continue;
      }
      if (count > opts.limit) {
        // An object, not a bare string: a string body reached the app as a JSON string with no
        // `.message`, which it showed as "check your connection" (E2E 2026-10-05 FS-3).
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Too many requests — try again later" },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
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
