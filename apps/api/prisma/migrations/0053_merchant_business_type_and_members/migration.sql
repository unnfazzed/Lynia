-- Merchant web upgrade L1 (docs/plans/2026-09-29-merchant-web-upgrade-plan.md §7): what a business
-- sells, and who works there. Access moves from the JWT `role` claim to `merchant_members` (RCA
-- 2026-08-18 C-1/C-2/C-4); `become` no longer flips `profiles.role`.

CREATE TYPE "MerchantBusinessType" AS ENUM ('restaurant', 'shop');
CREATE TYPE "MerchantShopKind" AS ENUM ('pharmacy', 'grocery', 'butchery', 'fashion', 'auto_parts', 'hardware', 'electronics', 'other');
CREATE TYPE "MerchantMemberRole" AS ENUM ('owner', 'staff');

-- `merchants` holds a handful of pilot rows. CONTRIBUTING forbids `ADD COLUMN … NOT NULL DEFAULT` on an
-- existing table, so: add nullable (metadata-only), set the default for new rows, backfill, then
-- SET NOT NULL (its validating scan is instant on a table this size).
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "business_type" "MerchantBusinessType";
ALTER TABLE "merchants" ALTER COLUMN "business_type" SET DEFAULT 'restaurant';
UPDATE "merchants" SET "business_type" = 'restaurant' WHERE "business_type" IS NULL;
ALTER TABLE "merchants" ALTER COLUMN "business_type" SET NOT NULL;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "shop_kind" "MerchantShopKind";

CREATE TABLE "merchant_members" (
  "id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "role" "MerchantMemberRole" NOT NULL,
  "display_name" TEXT NOT NULL,
  "terms_accepted_at" TIMESTAMP(3),
  "added_by_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_members_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "merchant_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One business per person; exactly one owner per business (partial — Prisma can't model it).
CREATE UNIQUE INDEX "merchant_members_profile_id_key" ON "merchant_members" ("profile_id");
CREATE UNIQUE INDEX "merchant_members_one_owner" ON "merchant_members" ("merchant_id") WHERE "role" = 'owner';
CREATE INDEX "merchant_members_merchant_id_idx" ON "merchant_members" ("merchant_id");

-- Backfill: every existing merchant's owner becomes its owner member, named as the profile knows them
-- (falling back to the business name). Idempotent; a profile already on a team is left alone.
INSERT INTO "merchant_members" ("id", "merchant_id", "profile_id", "role", "display_name", "created_at")
SELECT gen_random_uuid(), m."id", m."owner_profile_id", 'owner',
       COALESCE(NULLIF(btrim(p."first_name" || ' ' || p."last_name"), ''), m."name"),
       m."created_at"
FROM "merchants" m
JOIN "profiles" p ON p."id" = m."owner_profile_id"
ON CONFLICT DO NOTHING;
