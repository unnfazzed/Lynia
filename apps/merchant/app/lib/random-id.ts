/**
 * A random v4 UUID from the browser's own CSPRNG. `crypto.randomUUID` needs a secure context (https or
 * localhost); `crypto.getRandomValues` works in every context the tablet runs in, so it's the fallback.
 * Never `Math.random`: these ids key the per-device sign-up cap and a booking's idempotency, so they
 * must not be guessable (CodeQL js/insecure-randomness).
 */
export function randomUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
