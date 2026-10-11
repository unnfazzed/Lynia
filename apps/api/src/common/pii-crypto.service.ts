import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/**
 * At-rest protection for stored PII — currently the rider's national ID (A-04 / LR8 data-protection).
 *
 * Two derived keys from a single `PII_ENCRYPTION_KEY` (HKDF, distinct info labels so the AES key and the
 * HMAC key never coincide):
 *  - **encrypt/decrypt** — AES-256-GCM (authenticated) so a DB dump / backup / read-replica leak never
 *    exposes a national ID; the plaintext is only recovered when an admin opens the KYC review.
 *  - **hashId** — a deterministic HMAC used as the equality key for duplicate-ID detection, so the raw
 *    number is never the lookup key and never has to be queried in the clear.
 *
 * Ciphertext is versioned (`v1:` prefix). `decryptId` returns any non-prefixed value unchanged, so a row
 * that is still legacy plaintext (before the one-time backfill runs) reads correctly during rollout.
 */
const ENC_PREFIX = "v1:";
/** Owner decision D2 (2026-10-07): hand-over codes (delivery + pickup) are stored encrypted next to their
 *  hash, so showing a code is repeatable. Own prefix + own HKDF label, so a code ciphertext and a national-ID
 *  ciphertext can never be read as each other. */
const CODE_PREFIX = "c1:";
const IV_LEN = 12; // GCM standard nonce
const TAG_LEN = 16;

@Injectable()
export class PiiCryptoService {
  private readonly aesKey: Buffer;
  private readonly hmacKey: Buffer;
  private readonly codeKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    const material = Buffer.from(env.PII_ENCRYPTION_KEY, "utf8");
    // HKDF-SHA256 into two independent 32-byte keys. Empty salt is fine — the key material is the secret.
    this.aesKey = Buffer.from(hkdfSync("sha256", material, Buffer.alloc(0), "lynia-pii-aes-v1", 32));
    this.hmacKey = Buffer.from(hkdfSync("sha256", material, Buffer.alloc(0), "lynia-pii-hmac-v1", 32));
    this.codeKey = Buffer.from(hkdfSync("sha256", material, Buffer.alloc(0), "lynia-handover-code-aes-v1", 32));
  }

  /** D2: AES-256-GCM seal of a hand-over code → `c1:` + base64(iv | tag | ciphertext). The hash stays the
   *  verifier; this only lets the server show the SAME code again. Never log the input or the output.
   *  `aad` binds the ciphertext to where it lives (`"<kind>:<orderId>"`, see common/handover-code.ts):
   *  copied onto another order or the other code column, it no longer opens. */
  encryptCode(code: string, aad: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", this.codeKey, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
    return CODE_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
  }

  /** D2: open a `c1:` code ciphertext sealed under the same `aad`. Anything else — null, no prefix, a
   *  tampered, foreign-key or foreign-AAD value — is null, never a throw: the caller treats it as "no
   *  stored code". */
  decryptCode(stored: string | null | undefined, aad: string): string | null {
    if (typeof stored !== "string" || !stored.startsWith(CODE_PREFIX)) return null;
    try {
      const raw = Buffer.from(stored.slice(CODE_PREFIX.length), "base64");
      if (raw.length <= IV_LEN + TAG_LEN) return null;
      const decipher = createDecipheriv("aes-256-gcm", this.codeKey, raw.subarray(0, IV_LEN));
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN));
      return Buffer.concat([decipher.update(raw.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  /** Deterministic HMAC for equality lookups (dedup). Normalised so spacing/case can't evade a match. */
  hashId(plaintext: string): string {
    return createHmac("sha256", this.hmacKey).update(this.normalize(plaintext)).digest("hex");
  }

  /** AES-256-GCM encrypt → `v1:` + base64(iv | tag | ciphertext). */
  encryptId(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", this.aesKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext.trim(), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
  }

  /** Decrypt a `v1:`-prefixed value; a legacy (pre-backfill) plaintext value is returned unchanged. */
  decryptId(stored: string | null | undefined): string | null {
    if (stored == null) return null;
    if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext during rollout
    const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", this.aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  /** True if a stored value is already encrypted (used by the backfill to stay idempotent). */
  isEncrypted(stored: string | null | undefined): boolean {
    return typeof stored === "string" && stored.startsWith(ENC_PREFIX);
  }

  private normalize(v: string): string {
    // Strip ALL non-alphanumerics (spaces, dashes, dots) then upper-case, so the same physical ID
    // hashes identically no matter how it was punctuated — `63-123456-A-42`, `63123456A42`, and
    // `63 123456 A 42` must collide, or the duplicate-ID / ban-evasion control (which keys off this
    // hash) is defeated by trivially reformatting the number on the second account.
    return v.replace(/[^a-z0-9]/gi, "").toUpperCase();
  }
}
