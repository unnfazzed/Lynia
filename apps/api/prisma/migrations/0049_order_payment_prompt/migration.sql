-- Payment-prompt send/confirm flow (#670): the mocks draw a mobile-money prompt pushed to the
-- customer's phone → waiting → confirmed (RC.pay_push / pay_wait / pay_confirmed). The app shipped
-- only the manual-reference pay path, so those states had no order data to render from and were
-- BACKEND_GATED. This adds the prompt lifecycle ON the order, alongside (not replacing) the manual
-- rail: send-prompt → pending → confirmed/declined/expired, driven through the existing PaymentRail
-- adapter seam (default binding is the inert StubPaymentRail — no live charge, money-safe).
--
--   * payment_prompt_status      — pending | confirmed | declined | expired (null = no prompt sent);
--                                  the vocabulary is enforced at the wire layer (PaymentPromptStatus),
--                                  stored as text (no Prisma enum / CREATE TYPE needed).
--   * payment_prompt_rail        — ecocash | innbucks | omari (the customer's chosen mobile-money rail).
--   * payment_prompt_ref         — the rail's own transaction id (PaymentRailResult.providerRef).
--   * payment_prompt_sent_at     — when the prompt was pushed.
--   * payment_prompt_resolved_at — when it settled (confirmed/declined/expired).
--
-- Additive only: five NULLABLE columns on an existing table, no default, no backfill — catalog-only
-- in Postgres. No existing column is touched; the manual-reference columns keep working unchanged.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_prompt_status" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_prompt_rail" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_prompt_ref" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_prompt_sent_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "payment_prompt_resolved_at" TIMESTAMP(3);
