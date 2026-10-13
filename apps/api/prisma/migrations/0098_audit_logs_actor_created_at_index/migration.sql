-- Admin console v2 §8: the audit viewer filters by actor, newest first (GET /admin/audit?actor=). Expand-only,
-- built CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction). Mirrors 0093.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_actor_created_at_idx"
  ON "audit_logs" ("actor", "created_at");
