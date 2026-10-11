import { Logger } from "@nestjs/common";
import type { TokenService } from "../auth/token.service";
import type { PiiCryptoService } from "./pii-crypto.service";

/**
 * Owner decision D2 (2026-10-07): a hand-over code (the customer's delivery code, the counter's pickup
 * code) is stored twice — its HMAC hash, which is still the only thing a rider's attempt is checked
 * against, and an AES-GCM ciphertext (`PiiCryptoService.encryptCode`) so the server can show the SAME
 * code again. Before D2 the hash was all there was, so "show me the code" could only mean "mint a new
 * one", which killed the code already on another phone or already sent to the recipient (MJ-H1, U19).
 *
 * Each ciphertext is bound (AES-GCM AAD) to its kind and order id, so it can't be replayed onto another
 * order or the other code column; a carried code (U22's re-broadcast clone) is re-sealed under the new id.
 * Migration 0086's trigger drops both ciphertexts when the order can no longer use them.
 *
 * Neither the code nor its ciphertext is ever logged or audit-logged.
 */
export type HandoverCodeKind = "delivery" | "pickup";

const logger = new Logger("HandoverCode");

/** The AAD a code's ciphertext is sealed under. */
export function handoverCodeAad(kind: HandoverCodeKind, orderId: string): string {
  return `${kind}:${orderId}`;
}

/** The ciphertext to store next to a freshly minted code's hash. Null when the crypto service isn't
 *  wired (hand-built unit harnesses): the row is then hash-only, exactly the pre-D2 shape. */
export function sealHandoverCode(crypto: PiiCryptoService | undefined, kind: HandoverCodeKind, orderId: string, code: string): string | null {
  return crypto ? crypto.encryptCode(code, handoverCodeAad(kind, orderId)) : null;
}

/** The stored code, only when its ciphertext opens under this order's AAD AND hashes to the stored
 *  verifier. Anything else reads as "no stored code" (the caller falls back to the legacy path), so a stale
 *  value is never shown. A ciphertext that is present but doesn't authenticate or doesn't match is logged —
 *  kind, order id and which check failed only, never a value. */
export function openHandoverCode(
  crypto: PiiCryptoService | undefined,
  tokens: TokenService,
  kind: HandoverCodeKind,
  orderId: string,
  cipher: string | null | undefined,
  hash: string | null | undefined,
): string | null {
  if (!crypto || !cipher || !hash) return null;
  const code = crypto.decryptCode(cipher, handoverCodeAad(kind, orderId));
  if (code == null) {
    logger.warn(`handover code ciphertext did not authenticate (kind=${kind}, order=${orderId})`);
    return null;
  }
  if (!tokens.safeEqualHex(tokens.hash(code), hash)) {
    logger.warn(`handover code ciphertext does not match the stored hash (kind=${kind}, order=${orderId})`);
    return null;
  }
  return code;
}
