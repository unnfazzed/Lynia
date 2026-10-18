-- Biker referrals (owner 2026-10-18, ledger D-112). A biker shares lyniago.com/r/<code>; the friend installs from
-- Play with the code in the install referrer, and the app sends it with POST /riders/become. Ops read the numbers
-- in the admin console and pay the referrer in cash, recording it on the referral row.
-- Two new tables: none of CONTRIBUTING's online-safety rules for existing tables apply. Ids are plain uuids, not
-- foreign keys (the merchant_invites precedent): an erased profile is a tombstone and keeps its id. No personal data.

CREATE TABLE "referral_codes" (
  "rider_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("rider_id")
);

-- A code names one biker.
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes" ("code");

CREATE TABLE "referrals" (
  "id" UUID NOT NULL,
  "referrer_id" UUID NOT NULL,
  "referee_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(3),
  "paid_amount" DECIMAL(10,2),
  "paid_by" TEXT,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- A biker is referred once, ever: the first code wins and a friend is paid for at most once.
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals" ("referee_id");
-- One referrer's friends, for the console's per-biker rollup.
CREATE INDEX "referrals_referrer_id_idx" ON "referrals" ("referrer_id");
