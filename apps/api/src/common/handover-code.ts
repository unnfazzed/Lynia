import type { TokenService } from "../auth/token.service";
import type { PiiCryptoService } from "./pii-crypto.service";

/**
 * Owner decision D2 (2026-10-07): a hand-over code (the customer's delivery code, the counter's pickup
 * code) is stored twice — its HMAC hash, which is still the only thing a rider's attempt is checked
 * against, and an AES-GCM ciphertext (`PiiCryptoService.encryptCode`) so the server can show the SAME
 * code again. Before D2 the hash was all there was, so "show me the code" could only mean "mint a new
 * one", which killed the code already on another phone or already sent to the recipient (MJ-H1, U19).
 *
 * Neither the code nor its ciphertext is ever logged or audit-logged.
 */

/** The ciphertext to store next to a freshly minted code's hash. Null when the crypto service isn't
 *  wired (hand-built unit harnesses): the row is then hash-only, exactly the pre-D2 shape. */
export function sealHandoverCode(crypto: PiiCryptoService | undefined, code: string): string | null {
  return crypto ? crypto.encryptCode(code) : null;
}

/** The stored code, only when its ciphertext opens AND hashes to the stored verifier. A ciphertext that a
 *  hash-only writer left behind (or one under a rotated key) reads as "no stored code", so a stale value
 *  is never shown — the caller mints a fresh code and stores both, the legacy fallback. */
export function openHandoverCode(
  crypto: PiiCryptoService | undefined,
  tokens: TokenService,
  cipher: string | null | undefined,
  hash: string | null | undefined,
): string | null {
  if (!crypto || !cipher || !hash) return null;
  const code = crypto.decryptCode(cipher);
  if (code == null) return null;
  return tokens.safeEqualHex(tokens.hash(code), hash) ? code : null;
}
