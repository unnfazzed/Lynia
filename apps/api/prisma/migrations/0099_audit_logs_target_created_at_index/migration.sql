-- Admin console v2 §4/§8: the Audit tab and the person timeline page a target's rows newest first
-- (GET /admin/audit?target=, /admin/people/:id/timeline); (target, action) can't serve that order. Expand-only,
-- built CONCURRENTLY, the only statement in the file. Mirrors 0093.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_target_created_at_idx"
  ON "audit_logs" ("target", "created_at");
