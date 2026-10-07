import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PiiCryptoService } from "./pii-crypto.service";

const svc = new PiiCryptoService({ PII_ENCRYPTION_KEY: "a-strong-test-pii-key-0123456789abcdef" } as Env);
const ID = "63-123456-A-42";

describe("PiiCryptoService", () => {
  it("round-trips encrypt → decrypt", () => {
    const ct = svc.encryptId(ID);
    expect(ct).not.toContain(ID);
    expect(ct.startsWith("v1:")).toBe(true);
    expect(svc.decryptId(ct)).toBe(ID);
  });

  it("uses a fresh IV each time (ciphertexts differ, both decrypt)", () => {
    const a = svc.encryptId(ID);
    const b = svc.encryptId(ID);
    expect(a).not.toBe(b);
    expect(svc.decryptId(a)).toBe(ID);
    expect(svc.decryptId(b)).toBe(ID);
  });

  it("hashId is deterministic and normalises case/whitespace/punctuation (so a variant can't evade dedup)", () => {
    const h = svc.hashId(ID);
    expect(svc.hashId(ID)).toBe(h);
    expect(svc.hashId("  63-123456-a-42 ")).toBe(h);
    // Reformatting the separators must still collide, or the duplicate-ID control is trivially bypassed.
    expect(svc.hashId("63123456A42")).toBe(h);
    expect(svc.hashId("63 123456 A 42")).toBe(h);
    expect(svc.hashId("63.123456.a.42")).toBe(h);
    expect(svc.hashId("63-999999-B-11")).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  // D2 (owner 2026-10-07): hand-over codes are sealed so a reveal can show the SAME code again.
  it("encryptCode/decryptCode round-trip with a fresh IV, and never leak the code", () => {
    const a = svc.encryptCode("418290");
    const b = svc.encryptCode("418290");
    expect(a.startsWith("c1:")).toBe(true);
    expect(a).not.toContain("418290");
    expect(a).not.toBe(b);
    expect(svc.decryptCode(a)).toBe("418290");
    expect(svc.decryptCode(b)).toBe("418290");
  });

  it("decryptCode reads anything else as no code (null, plaintext, a national-ID ciphertext, tampering, another key) — never throws", () => {
    expect(svc.decryptCode(null)).toBeNull();
    expect(svc.decryptCode(undefined)).toBeNull();
    expect(svc.decryptCode("418290")).toBeNull();
    expect(svc.decryptCode(svc.encryptId("418290"))).toBeNull();
    expect(svc.decryptCode("c1:AAAA")).toBeNull();
    const ct = svc.encryptCode("418290");
    const flipped = ct.slice(0, -2) + (ct.endsWith("A") ? "B" : "A") + ct.slice(-1);
    expect(svc.decryptCode(flipped)).toBeNull();
    const other = new PiiCryptoService({ PII_ENCRYPTION_KEY: "a-different-test-pii-key-0123456789abcdef" } as Env);
    expect(other.decryptCode(ct)).toBeNull();
    // The national-ID decrypt can't open a code ciphertext either (separate key, separate prefix).
    expect(() => svc.decryptId(ct)).not.toThrow();
    expect(svc.decryptId(ct)).toBe(ct);
  });

  it("does not leak the id into the hash", () => {
    expect(svc.hashId(ID)).not.toContain(ID);
  });

  it("decryptId passes through legacy plaintext (pre-backfill rows) and null", () => {
    expect(svc.decryptId(ID)).toBe(ID); // no v1: prefix → returned unchanged
    expect(svc.decryptId(null)).toBeNull();
    expect(svc.decryptId(undefined)).toBeNull();
  });

  it("isEncrypted distinguishes ciphertext from plaintext", () => {
    expect(svc.isEncrypted(svc.encryptId(ID))).toBe(true);
    expect(svc.isEncrypted(ID)).toBe(false);
    expect(svc.isEncrypted(null)).toBe(false);
  });

  it("a different key cannot decrypt (authenticated)", () => {
    const other = new PiiCryptoService({ PII_ENCRYPTION_KEY: "a-different-test-key-0123456789abcdef" } as Env);
    expect(() => other.decryptId(svc.encryptId(ID))).toThrow();
  });
});
