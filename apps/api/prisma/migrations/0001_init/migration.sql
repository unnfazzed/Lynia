-- Lynia initial schema. Hand-authored so the offer-loop hot-path constraints
-- (ENG-REVIEW ET2/ET6/ET7) that Prisma can't express live in version control.

-- PostGIS for nearby-rider geo queries (ET6).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enums ----------------------------------------------------------------------
CREATE TYPE "Role"        AS ENUM ('customer', 'rider', 'merchant', 'admin');
CREATE TYPE "OrderType"   AS ENUM ('parcel', 'merchant');
CREATE TYPE "OrderStatus" AS ENUM (
  'requested', 'open_for_offers', 'assigned', 'confirmed', 'en_route_pickup',
  'picked_up', 'en_route_dropoff', 'delivered', 'completed', 'cancelled', 'expired'
);
CREATE TYPE "OfferType"   AS ENUM ('accept', 'counter');
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'selected', 'declined', 'expired');
CREATE TYPE "KycStatus"   AS ENUM ('pending', 'verified', 'failed');

-- Tables ---------------------------------------------------------------------
CREATE TABLE "profiles" (
  "id"                UUID PRIMARY KEY,
  "role"              "Role" NOT NULL DEFAULT 'customer',
  "first_name"        TEXT NOT NULL,
  "last_name"         TEXT NOT NULL,
  "phone"             TEXT NOT NULL UNIQUE,
  "email"             TEXT,
  "id_number"         TEXT,
  "photo_url"         TEXT,
  "phone_verified_at" TIMESTAMP(3),
  "orders_count"      INTEGER NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "riders" (
  "profile_id"        UUID PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "vehicle_info"      TEXT,
  "bike_reg"          TEXT NOT NULL,
  "photo_url"         TEXT NOT NULL,
  "id_verified"       BOOLEAN NOT NULL DEFAULT false,
  "kyc_status"        "KycStatus" NOT NULL DEFAULT 'pending',
  "kyc_ref"           TEXT,
  "is_online"         BOOLEAN NOT NULL DEFAULT false,
  "last_heartbeat_at" TIMESTAMP(3),
  "current_lat"       DOUBLE PRECISION,
  "current_lng"       DOUBLE PRECISION,
  "geog"              geography(Point, 4326),
  "trips_count"       INTEGER NOT NULL DEFAULT 0,
  "rating_avg"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rating_count"      INTEGER NOT NULL DEFAULT 0,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "merchants" (
  "id"         UUID PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "orders" (
  "id"                UUID PRIMARY KEY,
  "order_type"        "OrderType" NOT NULL DEFAULT 'parcel',
  "customer_id"       UUID NOT NULL REFERENCES "profiles"("id"),
  "rider_id"          UUID REFERENCES "riders"("profile_id"),
  "merchant_id"       UUID REFERENCES "merchants"("id"),
  "pickup"            JSONB NOT NULL,
  "dropoff"           JSONB NOT NULL,
  "item_desc"         TEXT NOT NULL,
  "note"              TEXT,
  "item_photo_url"    TEXT,
  "declared_value"    NUMERIC(10,2) NOT NULL DEFAULT 0,
  "size"              TEXT,
  "distance_km"       DOUBLE PRECISION,
  "suggested_fare"    NUMERIC(10,2) NOT NULL,
  "proposed_fare"     NUMERIC(10,2) NOT NULL,
  "agreed_fare"       NUMERIC(10,2),
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "otp_hash"          TEXT,
  "status"            "OrderStatus" NOT NULL DEFAULT 'requested',
  "confirmed_at"      TIMESTAMP(3),
  "pickup_started_at" TIMESTAMP(3),
  "collected_at"      TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "offers" (
  "id"           UUID PRIMARY KEY,
  "order_id"     UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "rider_id"     UUID NOT NULL REFERENCES "riders"("profile_id"),
  "type"         "OfferType" NOT NULL,
  "offered_fare" NUMERIC(10,2) NOT NULL,
  "eta_minutes"  INTEGER NOT NULL,
  "status"       "OfferStatus" NOT NULL DEFAULT 'pending',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "offers_offered_fare_positive" CHECK ("offered_fare" > 0)
);

CREATE TABLE "order_events" (
  "id"         UUID PRIMARY KEY,
  "order_id"   UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "status"     "OrderStatus" NOT NULL,
  "lat"        DOUBLE PRECISION,
  "lng"        DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "ratings" (
  "id"            UUID PRIMARY KEY,
  "order_id"      UUID NOT NULL UNIQUE REFERENCES "orders"("id") ON DELETE CASCADE,
  "by_profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "score"         INTEGER NOT NULL,
  "comment"       TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "sessions" (
  "id"                 UUID PRIMARY KEY,
  "profile_id"         UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "refresh_token_hash" TEXT NOT NULL,
  "user_agent"         TEXT,
  "expires_at"         TIMESTAMP(3) NOT NULL,
  "revoked_at"         TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "addresses" (
  "id"         UUID PRIMARY KEY,
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "label"      TEXT NOT NULL,
  "point"      JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Indexes & hot-path constraints ---------------------------------------------
-- Nearby-rider radius search (ET6): GiST on the geography column for ST_DWithin.
CREATE INDEX "riders_geog_gist" ON "riders" USING GIST ("geog");

-- Offer loop (ET7): one offer per rider per order; fast lookups for matching.
CREATE UNIQUE INDEX "offers_order_id_rider_id_key" ON "offers" ("order_id", "rider_id");
CREATE INDEX "offers_order_id_status_idx" ON "offers" ("order_id", "status");
CREATE INDEX "offers_rider_id_idx" ON "offers" ("rider_id");
CREATE INDEX "orders_status_idx" ON "orders" ("status");
CREATE INDEX "orders_rider_id_idx" ON "orders" ("rider_id");
CREATE INDEX "order_events_order_id_idx" ON "order_events" ("order_id");
CREATE INDEX "sessions_profile_id_idx" ON "sessions" ("profile_id");
CREATE INDEX "addresses_profile_id_idx" ON "addresses" ("profile_id");

-- ET2: a rider can hold at most ONE active ride at a time. The second concurrent
-- selection hits this unique violation instead of double-booking the rider.
CREATE UNIQUE INDEX "one_active_ride" ON "orders" ("rider_id")
  WHERE "status" IN (
    'assigned', 'confirmed', 'en_route_pickup', 'picked_up', 'en_route_dropoff'
  );
