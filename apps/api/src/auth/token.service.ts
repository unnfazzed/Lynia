import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

export interface AccessClaims {
  sub: string;
  role: string;
}

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly accessTtl: number;

  constructor(@Inject(ENV) env: Env) {
    this.secret = env.JWT_SIGNING_SECRET;
    this.accessTtl = env.ACCESS_TTL_SECONDS;
  }

  /** Short-lived access JWT (HS256). role is checked server-side per request, not trusted blindly. */
  signAccess(sub: string, role: string): string {
    return jwt.sign({ role }, this.secret, { subject: sub, expiresIn: this.accessTtl });
  }

  verifyAccess(token: string): AccessClaims {
    const payload = jwt.verify(token, this.secret);
    if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.role !== "string") {
      throw new Error("Malformed access token claims");
    }
    return { sub: payload.sub, role: payload.role };
  }

  /** HMAC over a secret — used to store OTP codes and refresh tokens as hashes, never plaintext. */
  hash(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("hex");
  }

  /** Cryptographically-random 6-digit OTP. */
  randomOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  safeEqualHex(a: string, b: string): boolean {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
