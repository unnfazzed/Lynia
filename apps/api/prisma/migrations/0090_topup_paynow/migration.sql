-- Biker top-ups through Paynow (docs/plans/2026-10-paynow-biker-wallet.md, owner 2026-10-12).
--
-- poll_url     — the Paynow URL we poll to confirm a charge. Server-side only: it never reaches the app.
-- charged      — what the biker is charged: the amount credited plus the transaction fee, then Paynow's own
--                figure once it reports one. `amount` stays the credit.
-- rail_payload — the untouched last message from the rail (the PaymentRail seam's raw-payload rule), so a
--                mapping bug is reconstructable and ops can reconcile against Paynow's own record.
--
-- Expand-only: nullable columns with no default are a catalog-only change on PostgreSQL (no table rewrite,
-- no long lock). Existing rows read NULL, which the code treats as "no rail call made" — how every row was
-- created before, so the still-live old revision neither reads nor writes them. No backfill.
ALTER TABLE "top_ups" ADD COLUMN "poll_url" TEXT;
ALTER TABLE "top_ups" ADD COLUMN "charged" DECIMAL(10,2);
ALTER TABLE "top_ups" ADD COLUMN "rail_payload" JSONB;
