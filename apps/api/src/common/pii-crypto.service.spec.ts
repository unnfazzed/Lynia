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

  it("hashId is deterministic and normalises case/whitespace (so a variant can't evade dedup)", () => {
    const h = svc.hashId(ID);
    expect(svc.hashId(ID)).toBe(h);
    expect(svc.hashId("  63-123456-a-42 ")).toBe(h);
    expect(svc.hashId("63-999999-B-11")).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
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
