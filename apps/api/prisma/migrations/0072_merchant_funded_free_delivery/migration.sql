-- Free delivery paid by the restaurant or shop (owner decision 2026-10-02, ledger D-71; handoffs
-- calm-mint-v2-2026-10 README §5 and browse-v2 README §7: "a merchant-funded free_delivery flag per venue").
--
-- merchants.free_delivery: the venue's switch (Account → Taking orders, or ops in the admin console).
-- Off for every venue until the venue turns it on.
--
-- orders.merchant_delivery_share: the part of the rider's delivery fee the venue pays on THIS order,
-- snapshotted at placement so a later change of the switch never reprices an order in flight. Null on
-- every order the venue does not fund, and on every order placed before this migration, so all existing
-- totals read exactly as before. The rider always keeps the full delivery_fee; the customer pays
-- goods + delivery_fee - share; the venue's cash is merchant_goods_total - share.
--
-- Expand-only and online-safe: one boolean with a constant default (catalog-only on PG 11+) and one
-- nullable column. No backfill, no rewrite.
ALTER TABLE "merchants" ADD COLUMN "free_delivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "merchant_delivery_share" DECIMAL(10,2);
