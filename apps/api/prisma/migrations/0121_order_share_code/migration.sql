-- Shop share links (docs/plans/2026-11-07-shop-share-links.md, ledger D-129): which share link an order came through.
-- A nullable column with no default: a metadata-only change on Postgres, no rewrite and no long lock on "orders".
-- Null for every existing row. No index: attribution is read by reports, never on a hot path.
ALTER TABLE "orders" ADD COLUMN "share_code" VARCHAR(6);
