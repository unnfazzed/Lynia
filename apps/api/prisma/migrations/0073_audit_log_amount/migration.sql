-- Notifications v1 follow-up (owner 2026-10-02): a wallet credit's feed row reads as the design's
-- sentence ("$5.00 top-up added. Your balance is $12.60."), so the `wallet.credit` audit row records the
-- amount and the balance it left. Expand-only: two nullable columns, no default, no rewrite; existing rows
-- stay null and the feed keeps their old line.
ALTER TABLE "audit_logs" ADD COLUMN "amount" DECIMAL(10,2);
ALTER TABLE "audit_logs" ADD COLUMN "balance_after" DECIMAL(10,2);
