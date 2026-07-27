-- Rider-utilization metric: orders per active rider per day.
-- Plan reference: docs/plans/2026-07-26-merchant-verticals-plan.md §0a (new P0 task) —
-- the tripwire for the merchant-vertical thesis is a fleet average < 1 order/active-rider/day
-- by Sep 15 (revisit rider-recruitment pacing and Restaurants launch scope before P5).
--
-- "Active rider" on a day = a rider who had >= 1 order reach `assigned` (or beyond) that day,
-- OR sent a heartbeat that day (is-online activity without work still counts as supply that
-- showed up and found nothing — that is exactly what the tripwire must see).
--
-- Run weekly against prod (read-only). At pilot scale a manual run is enough:
--   psql "$DATABASE_URL" -f scripts/utilization-metric.sql

WITH days AS (
  SELECT d::date AS day
  FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d
),
supply AS ( -- riders who showed up: heartbeat or assignment activity that day
  SELECT DISTINCT day, rider_id FROM (
    SELECT date(o.created_at) AS day, o.rider_id
    FROM orders o
    WHERE o.rider_id IS NOT NULL
      AND o.created_at >= current_date - interval '13 days'
    UNION
    SELECT date(r.last_heartbeat_at) AS day, r.profile_id AS rider_id
    FROM riders r
    WHERE r.last_heartbeat_at >= current_date - interval '13 days'
  ) s
),
demand AS ( -- orders that actually got a rider that day (assigned or beyond at some point)
  SELECT date(o.created_at) AS day,
         count(*)                                        AS orders_total,
         count(*) FILTER (WHERE o.order_type = 'parcel') AS orders_express,
         count(*) FILTER (WHERE o.order_type = 'merchant') AS orders_merchant,
         count(*) FILTER (WHERE o.rider_id IS NOT NULL)  AS orders_assigned
  FROM orders o
  WHERE o.created_at >= current_date - interval '13 days'
  GROUP BY 1
)
SELECT
  days.day,
  COALESCE(d.orders_total, 0)                    AS orders_total,
  COALESCE(d.orders_assigned, 0)                 AS orders_assigned,
  COALESCE(d.orders_express, 0)                  AS express,
  COALESCE(d.orders_merchant, 0)                 AS merchant,
  COALESCE(s.active_riders, 0)                   AS active_riders,
  ROUND(COALESCE(d.orders_assigned, 0)::numeric
        / NULLIF(s.active_riders, 0), 2)         AS orders_per_active_rider
FROM days
LEFT JOIN demand d ON d.day = days.day
LEFT JOIN (SELECT day, count(*) AS active_riders FROM supply GROUP BY 1) s ON s.day = days.day
ORDER BY days.day;

-- Tripwire check (14-day fleet average):
--   SELECT ROUND(avg(orders_per_active_rider), 2) FROM (<the query above>) t
--   WHERE active_riders > 0;
-- < 1.00 by Sep 15 => the utilization thesis is in trouble (plan §0a).
