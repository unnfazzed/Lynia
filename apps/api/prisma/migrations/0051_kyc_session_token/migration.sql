-- Didit session credentials, persisted so a rider can RESUME an unfinished ID check instead of
-- minting a fresh (paid) session on every "Finish verifying" tap.
--
-- Why both columns: Didit returns `session_token` AND the hosted `url` only from POST /v3/session/ at
-- create time. GET /v3/session/{id}/decision/ returns status but neither credential. The native SDK
-- needs the token; the CURRENTLY SHIPPED app opens the url. Storing both means the resume path serves
-- whichever client is asking, and today's browser build keeps working with no client change.
-- (docs/plans/2026-08-20-navigation-fix-forward.md P0-2, owner decision D7.)
--
-- BOTH ARE SECRETS: they grant access to that rider's verification flow. Treated like DIDIT_API_KEY —
-- never logged, returned only to the owning rider, never in an admin payload or an audit row, cleared
-- the moment the session reaches a terminal state, and nulled on erasure (unlike verified_id_hash,
-- which is a one-way hash retained deliberately per DS15-02b).
--
-- LOCKING. `ADD COLUMN` is NOT lock-free: it takes an ACCESS EXCLUSIVE lock. Nullable with no default
-- means no table rewrite, so the lock is held only for the catalog update — but ACQUIRING it queues
-- behind any in-flight query on `riders`, and while queued it blocks every query arriving after it.
-- On a live table that is how a metadata-only change becomes an outage. Bound the wait so we fail fast
-- instead: 3s, then the migration errors out and the deploy is re-run against a quieter moment. Safe to
-- re-run — every statement here is idempotent.
SET lock_timeout = '3s';

ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "kyc_session_token" TEXT;
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "kyc_session_url" TEXT;

-- Scoped to this migration's transaction; don't leak the bound to whatever the runner does next.
RESET lock_timeout;
