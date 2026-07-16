-- FRAUD P2-4: a dispute-confirmed "rider_strike" (issues.resolve) previously incremented the SAME
-- `cancel_strikes` column the pre-pickup-cancel path uses — two distinct offence meanings sharing one
-- counter. Two bugs fell out of that: (1) a rider's 3rd cancel RESETS cancel_strikes to 0, silently
-- wiping any dispute strikes riding alongside; (2) RIDER_STRIKE_LIMIT was never enforced on the dispute
-- path (the cancel lifecycle only reacts to cancels), so dispute strikes had no consequence at all.
-- Give dispute strikes their own counter so the two axes stop colliding; issues.resolve now increments
-- THIS column and applies the cooldown consequence at RIDER_STRIKE_LIMIT. Additive, NOT NULL DEFAULT 0 —
-- Postgres backfills existing rows in place (no rewrite of a populated table at pilot scale).
ALTER TABLE "riders" ADD COLUMN "dispute_strikes" INTEGER NOT NULL DEFAULT 0;
