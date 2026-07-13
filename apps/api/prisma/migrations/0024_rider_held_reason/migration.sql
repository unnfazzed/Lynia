-- RH-01 (DEEP-SWEEP-2026-07-13): persist WHY a rider is on hold so applyReliabilityDelta's score
-- hysteresis can distinguish a score-based "reliability" hold (self-clears as the score recovers back
-- to ON_HOLD_CLEAR_AT) from the FRAUD P0-3 velocity/fraud hold (#198), which must survive a score
-- recovery and be released only by an explicit admin clear-hold. Without this, the next completion/
-- rating recovery ran the shared hysteresis and silently un-held an abusive rider (the RH-01 bug).
--
-- Additive, nullable, no default (null = not held, OR a legacy on_hold=true row that predates this
-- column → keeps the pre-RH-01 score-clearable behaviour, no backfill). Online-safe.
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "held_reason" TEXT;
