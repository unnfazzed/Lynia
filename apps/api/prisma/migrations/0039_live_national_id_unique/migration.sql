-- IR26-05: DB-level backstop for the one-ID-one-account rule (IR26-01) — a national ID may sit on at
-- most ONE live profile. Partial: erased tombstones (phone 'erased:<id>') keep their id_number_hash
-- for ban-evasion dedupe (DS15-02b) but are deliberately OUT of the unique scope, so a legitimate
-- returning user can re-register with their own ID; NULLs (no ID yet) never collide. The application
-- already enforces this with advisory-locked counts (rider.service/auth.service, IR26-01) — this
-- index is defense-in-depth for any write path that bypasses those checks, and both ID-write paths
-- map its P2002 to the same 409 `id_in_use`.
--
-- Built CONCURRENTLY, out-of-band — only statement in the file (Prisma wraps multi-statement files in
-- one transaction, where CONCURRENTLY is illegal). Mirrors migration 0021/0029/0036/0038.
--
-- OPS NOTE (pre-#398 legacy data): if the table already contains two LIVE profiles sharing an
-- id_number_hash, this build FAILS and `migrate deploy` halts BEFORE the deploy's traffic move (the
-- running revision keeps serving). Postgres leaves an INVALID index behind on a failed CONCURRENT
-- build — resolve the duplicate accounts via support/ops (decide which profile keeps the ID), then
-- `DROP INDEX IF EXISTS "profiles_live_id_number_hash_unique";` and re-run the deploy. Detection:
--   SELECT id_number_hash, count(*) FROM profiles
--   WHERE id_number_hash IS NOT NULL AND phone NOT LIKE 'erased:%'
--   GROUP BY id_number_hash HAVING count(*) > 1;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "profiles_live_id_number_hash_unique"
  ON "profiles" ("id_number_hash")
  WHERE "id_number_hash" IS NOT NULL AND "phone" NOT LIKE 'erased:%';
