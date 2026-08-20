-- When this rider last SPENT a forced KYC session replacement.
--
-- `POST /riders/kyc/retry {force:true}` exists because Didit's session expiry is silent — it fires no
-- webhook, so the server's free resume path cannot see it and would hand the same dead token back on
-- every tap. Only the device, which watched the SDK reject it, can say so.
--
-- That makes `force` a client-asserted bypass of the ONE thing keeping a pending rider from buying
-- paid vendor sessions, and it needs a server-side bound: the route's 5/hour throttle is the only
-- other limit, and the A-02 two-attempt lock does not apply because a mint deliberately never
-- increments kyc_attempts (D4). Unbounded, an authenticated rider could burn five Didit credits an
-- hour by asserting expiry on a session that never expired.
--
-- This column is that bound, and one timestamp is enough because the rule is a rate, not a flag: a
-- genuine expiry needs exactly ONE replacement, so a second force inside the window is refused and
-- falls back to the free resume. Claimed by a single conditional UPDATE before the vendor is ever
-- called, so two concurrent forced requests cannot both pay (see RiderService.retryKyc).
--
-- Not a secret and not PII on its own, but it is nulled on erasure with the rest of the KYC session
-- state so a tombstone carries no activity trace.
--
-- LOCKING. `ADD COLUMN` is NOT lock-free: it takes an ACCESS EXCLUSIVE lock. Nullable with no default
-- means no table rewrite, so the lock is held only for the catalog update — but ACQUIRING it queues
-- behind any in-flight query on `riders`, and while queued it blocks every query arriving after it.
-- Bound the wait so we fail fast instead: 3s, then the migration errors and the deploy is re-run
-- against a quieter moment. Safe to re-run — every statement here is idempotent.
SET lock_timeout = '3s';

ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "kyc_forced_at" TIMESTAMP(3);

-- Scoped to this migration's transaction; don't leak the bound to whatever the runner does next.
RESET lock_timeout;
