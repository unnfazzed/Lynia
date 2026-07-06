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
 * Keyed by authenticated subject when present, else client IP. Because a global guard runs before the
 * route's JwtAuthGuard, `req.user` is usually unset here, so the effective key is the client IP — the
 * same basis the existing OTP limiter uses; adequate to blunt brute-force / flood abuse.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OTP_STORE) private readonly store: OtpStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: { sub?: string };
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const identity = req.user?.sub ?? req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = `rl:throttle:${opts.keyPrefix}:${identity}`;

    const count = await this.store.hit(key, opts.windowSec);
    if (count > opts.limit) {
      // Same shape AuthService.enforceRate raises for the OTP limiter.
      throw new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
