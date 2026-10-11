import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D2 review (2026-10-11): a hand-over code that can no longer be used must not stay decryptable. There are
 * many cancel / expiry / not-delivered writers (some raw SQL), so migration 0086 clears the ciphertexts in
 * one BEFORE trigger on `orders`. This pins what the trigger covers; the integration specs
 * (order-lifecycle.int.spec.ts "D2 / U22") prove it fires against a real database.
 */
const sql = readFileSync(resolve(__dirname, "../../prisma/migrations/0086_handover_code_cipher/migration.sql"), "utf8");

describe("migration 0086 — orders_clear_handover_ciphers trigger", () => {
  it("drops both ciphertexts on every terminal status", () => {
    const terminal = /IF NEW\."status" IN \(([^)]*)\) THEN\s+NEW\."otp_cipher" := NULL;\s+NEW\."pickup_code_cipher" := NULL;/.exec(sql);
    expect(terminal).not.toBeNull();
    const statuses = terminal![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(statuses.sort()).toEqual(["cancelled", "completed", "delivered", "expired", "undelivered"]);
  });

  it("drops the pickup ciphertext once the rider has collected", () => {
    expect(sql).toMatch(/ELSIF NEW\."status" IN \('picked_up', 'en_route_dropoff'\) THEN\s+NEW\."pickup_code_cipher" := NULL;/);
  });

  it("fires before every insert and every write of the status or a ciphertext column", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF "status", "otp_cipher", "pickup_code_cipher" ON "orders"/);
    expect(sql).toMatch(/FOR EACH ROW EXECUTE FUNCTION "orders_clear_handover_ciphers"\(\)/);
  });
});
