-- Item 3: an indexed geography column for the pickup point, derived from the pickup JSON.
-- Every function here is IMMUTABLE, so the STORED generated column is legal; existing rows are
-- auto-backfilled and malformed pickup JSON (a null lat/lng extract) yields a NULL geog rather
-- than an error. This replaces the per-row JSON extraction in listOpenNearby with a GiST scan.
ALTER TABLE "orders"
  ADD COLUMN "pickup_geog" geography(Point,4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(
      ST_MakePoint(
        (("pickup" -> 'point' ->> 'lng')::double precision),
        (("pickup" -> 'point' ->> 'lat')::double precision)
      ),
      4326
    )::geography
  ) STORED;

CREATE INDEX "orders_pickup_geog_gist" ON "orders" USING GIST ("pickup_geog");
