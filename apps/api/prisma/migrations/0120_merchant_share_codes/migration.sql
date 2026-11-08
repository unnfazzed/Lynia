-- Shop share links (docs/plans/2026-11-07-shop-share-links.md, ledger D-129). A business's code for
-- lyniago.com/s/<name>-<code>, minted on first ask (the referral_codes precedent, 0106). A new table: none of
-- CONTRIBUTING's online-safety rules for existing tables apply, and `merchants` is not touched. The id is a
-- plain uuid, not a foreign key, like referral_codes and merchant_invites. No personal data.

CREATE TABLE "merchant_share_codes" (
  "merchant_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_share_codes_pkey" PRIMARY KEY ("merchant_id")
);

-- A code names one business.
CREATE UNIQUE INDEX "merchant_share_codes_code_key" ON "merchant_share_codes" ("code");
