-- Synthetic dataset for migration-lock rehearsal on the STAGING clone.
-- Plan reference: docs/plans/2026-07-26-merchant-verticals-plan.md §0b.9 — prod is empty
-- pre-launch, so "no long lock on a prod-sized clone" needs a seeded dataset. This creates
-- ~100k orders + 500 riders + 5k customers shaped like real Harare traffic, so ALTER TABLE
-- rehearsals on `orders` measure something.
--
-- STAGING ONLY. Two guards (ALLOW-LIST semantics — env.ts defaults APP_ENV to "production",
-- so a "not production" blocklist check passes on any laptop with APP_ENV unset while
-- pointed at the prod DATABASE_URL; require the explicit staging opt-in instead):
--   1. Refuses to run if the database already contains real-looking data (any order whose
--      customer phone does not carry the +263771000 synthetic prefix while orders exist).
--   2. Invoke ONLY via the explicit allow-list check:
--        [ "$APP_ENV" = "staging" ] && psql "$DATABASE_URL" -f scripts/seed-synthetic-orders.sql \
--          || echo "refusing: APP_ENV must be explicitly 'staging'"
--
-- Everything synthetic is tagged: phones +2637710xxxxx, item_desc 'synthetic:...'.
-- Cleanup: DELETE FROM orders WHERE item_desc LIKE 'synthetic:%'; then profiles by phone prefix.

\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM orders o JOIN profiles p ON p.id = o.customer_id
             WHERE p.phone NOT LIKE '+2637710%' LIMIT 1) THEN
    RAISE EXCEPTION 'seed-synthetic-orders: database contains non-synthetic orders — refusing (staging clone only)';
  END IF;
END
$guard$;

BEGIN;

-- 5k synthetic customers
INSERT INTO profiles (id, role, first_name, last_name, phone, created_at, updated_at)
SELECT gen_random_uuid(), 'customer', 'Syn', 'Customer' || n,
       '+26377100' || lpad(n::text, 5, '0'),
       now() - (random() * interval '120 days'), now()
FROM generate_series(1, 5000) n
ON CONFLICT (phone) DO NOTHING;

-- 500 synthetic riders (profile + rider row, positioned around Harare CBD)
INSERT INTO profiles (id, role, first_name, last_name, phone, created_at, updated_at)
SELECT gen_random_uuid(), 'rider', 'Syn', 'Rider' || n,
       '+26377101' || lpad(n::text, 4, '0'),
       now() - (random() * interval '120 days'), now()
FROM generate_series(1, 500) n
ON CONFLICT (phone) DO NOTHING;

INSERT INTO riders (profile_id, bike_reg, photo_url, is_online, last_heartbeat_at,
                    current_lat, current_lng, geog)
SELECT p.id, 'SYN-' || substr(p.phone, 9), 'https://example.invalid/synthetic.jpg',
       random() < 0.4, now() - (random() * interval '2 days'),
       -17.83 + (random() - 0.5) * 0.08, 31.05 + (random() - 0.5) * 0.08,
       ST_SetSRID(ST_MakePoint(31.05 + (random() - 0.5) * 0.08,
                               -17.83 + (random() - 0.5) * 0.08), 4326)::geography
FROM profiles p
WHERE p.phone LIKE '+26377101%'
ON CONFLICT (profile_id) DO NOTHING;

-- ~100k orders across terminal + a sliver of active statuses, spread over 120 days.
-- Status mix approximates a real book: mostly completed/delivered, some cancelled/expired,
-- few active (active ones get riders and respect one_active_ride by giving each rider
-- at most one active order).
WITH customers AS (
  SELECT id, row_number() OVER () rn FROM profiles WHERE phone LIKE '+26377100%'
),
riders_n AS (
  SELECT profile_id, row_number() OVER () rn FROM riders WHERE bike_reg LIKE 'SYN-%'
)
INSERT INTO orders (id, order_type, customer_id, rider_id, item_desc, suggested_fare,
                    proposed_fare, agreed_fare, status, created_at, updated_at)
SELECT gen_random_uuid(),
       'parcel',
       c.id,
       CASE WHEN mix.status IN ('completed','delivered','cancelled') AND random() < 0.9
            THEN r.profile_id ELSE NULL END,
       'synthetic: rehearsal order ' || n,
       (1 + random() * 9)::numeric(10,2),
       (1 + random() * 9)::numeric(10,2),
       (1 + random() * 9)::numeric(10,2),
       mix.status::"OrderStatus",
       now() - (random() * interval '120 days'),
       now()
FROM generate_series(1, 100000) n
JOIN LATERAL (SELECT CASE
     WHEN n % 100 < 62 THEN 'completed'
     WHEN n % 100 < 82 THEN 'delivered'
     WHEN n % 100 < 92 THEN 'cancelled'
     WHEN n % 100 < 99 THEN 'expired'
     ELSE 'requested' END AS status) mix ON true
JOIN customers c ON c.rn = (n % 5000) + 1
JOIN riders_n  r ON r.rn = (n % 500) + 1;

COMMIT;

ANALYZE orders; ANALYZE profiles; ANALYZE riders;

-- Sanity: SELECT status, count(*) FROM orders GROUP BY 1 ORDER BY 2 DESC;
