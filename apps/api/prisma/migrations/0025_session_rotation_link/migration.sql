-- RT-GRACE (bug-sweep 2026-07-14): refresh-token rotation had no lost-response grace — if the rotate
-- response was dropped in flight, the client's retry presented the now-revoked token and got a hard
-- 401, forcing a full re-OTP. This column links a rotated session to the successor it was rotated into,
-- so refresh() can recognise the single legitimate "lost the response" retry (a rotation-revoke whose
-- successor is still un-consumed, within a short window) and re-issue, WITHOUT weakening reuse detection
-- (a token whose successor was already consumed, or that was revoked by logout, is still rejected).
--
-- Additive, nullable, no default (null = not rotated → the pre-RT-GRACE reject-on-revoked behaviour, no
-- backfill needed for existing rows). Online-safe.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "rotated_to_id" UUID;
