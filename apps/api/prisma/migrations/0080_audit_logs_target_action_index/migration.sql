-- PW-LC1: the notifications feed (notifications-feed.service.ts feedForUser) reads `audit_logs` back by
-- `target` (the viewer's profile id, or their order ids) + `action`, several times per open; the table only
-- had a created_at index, so each read scanned an append-only table that never shrinks. Leading on target,
-- it also serves the admin reads that filter by target alone. Expand-only, built CONCURRENTLY, the only
-- statement in the file (CONCURRENTLY can't run inside a transaction). Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_target_action_idx"
  ON "audit_logs" ("target", "action");
