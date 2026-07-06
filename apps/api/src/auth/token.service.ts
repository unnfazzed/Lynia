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
  /** Current signing secret — always used to SIGN new access tokens. */
  private readonly secret: string;
  /** Optional previous secret — accepted on VERIFY only, so a secret rotation is zero-downtime: old
   *  access tokens (≤ ACCESS_TTL) keep verifying while new ones are signed with the current secret. */
  private readonly previousSecret?: string;
  /** Key for HMAC hashing (OTP codes + refresh tokens). Separated from the JWT signing secret so the
   *  signing secret can be rotated WITHOUT invalidating every stored refresh-token hash (mass logout).
   *  Defaults to the JWT secret for backward-compatibility when TOKEN_HASH_SECRET is unset. */
  private readonly hashSecret: string;
  private readonly accessTtl: number;

  constructor(@Inject(ENV) env: Env) {
    this.secret = env.JWT_SIGNING_SECRET;
    this.previousSecret = env.JWT_SIGNING_SECRET_PREVIOUS;
    this.hashSecret = env.TOKEN_HASH_SECRET ?? env.JWT_SIGNING_SECRET;
    this.accessTtl = env.ACCESS_TTL_SECONDS;
  }

  /** Short-lived access JWT. HS256 is pinned on both sign and verify — pinning the verify algorithm
   *  closes any algorithm-confusion vector (a token must be HS256, never "none" or an asymmetric alg). */
  signAccess(sub: string, role: string): string {
    return jwt.sign({ role }, this.secret, { subject: sub, expiresIn: this.accessTtl, algorithm: "HS256" });
  }

  verifyAccess(token: string): AccessClaims {
    const payload = this.verifyWithRotation(token);
    if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.role !== "string") {
      throw new Error("Malformed access token claims");
    }
    return { sub: payload.sub, role: payload.role };
  }

  /** Verify against the current secret, falling back to the previous secret during a rotation window.
   *  Both are HS256-pinned; if neither verifies, the current secret's error propagates. */
  private verifyWithRotation(token: string): jwt.JwtPayload | string {
    try {
      return jwt.verify(token, this.secret, { algorithms: ["HS256"] });
    } catch (err) {
      if (this.previousSecret) {
        return jwt.verify(token, this.previousSecret, { algorithms: ["HS256"] });
      }
      throw err;
    }
  }

  /** HMAC over the hash key — used to store OTP codes and refresh tokens as hashes, never plaintext. */
  hash(value: string): string {
    return createHmac("sha256", this.hashSecret).update(value).digest("hex");
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
