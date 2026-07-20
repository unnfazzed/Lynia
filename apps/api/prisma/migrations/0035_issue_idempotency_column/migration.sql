-- Issue create idempotency (BH-22): a client-generated key derived from (orderId, type, description).
-- A lost-response retry on `POST /orders/:id/issues` replays the same key; IssuesService.raise dedupes
-- on (opened_by_profile_id, idempotency_key) and returns the original issue instead of opening a second
-- dispute for the same complaint. Nullable, no default — additive-only, no table rewrite. The dedup
-- index itself is built CONCURRENTLY in its own migration (0036) so it doesn't take a write lock here.
ALTER TABLE "issues" ADD COLUMN "idempotency_key" TEXT;
