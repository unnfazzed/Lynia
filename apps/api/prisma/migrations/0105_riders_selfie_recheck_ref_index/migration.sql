-- Owner 2026-10-15 (#1216): every Didit webhook and reconcile read now first asks "is this a selfie re-check?"
-- (RiderService.selfieRecheckOwner, `WHERE selfie_recheck_ref = $1`), which scanned the whole riders table.
-- Expand-only, built CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction).
-- Mirrors 0103.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "riders_selfie_recheck_ref_idx"
  ON "riders" ("selfie_recheck_ref");
