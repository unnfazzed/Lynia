-- Rider-utilization metric: orders per active rider per day.
-- Plan reference: docs/plans/2026-07-26-merchant-verticals-plan.md §0a (new P0 task) —
-- the tripwire for the merchant-vertical thesis is a fleet average < 1 order/active-rider/day
-- by Sep 15 (revisit rider-recruitment pacing and Restaurants launch scope before P5).
--
-- Definitions (history-table-accurate; review-corrected):
--   assignments(day)  = order_events rows with status 'assigned' created that day — the true
--                       "an order reached a rider that day" signal (not order-creation day).
--   active_riders(day)= distinct riders attached to an order with an 'assigned' event that day
--                       (attribution uses the order's current rider_id — on the rare
--                       reassignment this credits the final rider; acceptable at pilot scale)
--                       PLUS, for TODAY'S ROW ONLY, riders whose last_heartbeat_at is today.
--                       riders.last_heartbeat_at is a single overwritten column, so heartbeat
--                       presence CANNOT be reconstructed for past days — historical rows count
--                       working riders only and therefore OVERSTATE utilization for idle-rider
--                       days. For tripwire purposes run this daily (or at least weekly) and
--                       archive today's row; never read a historical row as heartbeat-accurate.
--   orders_per_active_rider = assignments / active_riders.
--
--   psql "$DATABASE_URL" -f scripts/utilization-metric.sql

WITH days AS (
  SELECT d::date AS day
  FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d
),
assignment_events AS (
  SELECT date(e.created_at) AS day, e.order_id, o.rider_id, o.order_type
  FROM order_events e
  JOIN orders o ON o.id = e.order_id
  WHERE e.status = 'assigned'
    AND e.created_at >= current_date - interval '13 days'
),
supply AS (
  SELECT day, count(DISTINCT rider_id) AS active_riders
  FROM (
    SELECT day, rider_id FROM assignment_events WHERE rider_id IS NOT NULL
    UNION
    SELECT current_date AS day, r.profile_id AS rider_id  -- heartbeat arm: TODAY ONLY (see header)
    FROM riders r
    WHERE date(r.last_heartbeat_at) = current_date
  ) s
  GROUP BY day
),
demand AS (
  SELECT day,
         count(*)                                          AS assignments,
         count(*) FILTER (WHERE order_type = 'parcel')     AS express,
         count(*) FILTER (WHERE order_type = 'merchant')   AS merchant
  FROM assignment_events
  GROUP BY day
)
SELECT
  days.day,
  COALESCE(d.assignments, 0)               AS assignments,
  COALESCE(d.express, 0)                   AS express,
  COALESCE(d.merchant, 0)                  AS merchant,
  COALESCE(s.active_riders, 0)             AS active_riders,
  ROUND(COALESCE(d.assignments, 0)::numeric
        / NULLIF(s.active_riders, 0), 2)   AS orders_per_active_rider,
  (days.day = current_date)                AS heartbeat_arm_included
FROM days
LEFT JOIN demand d ON d.day = days.day
LEFT JOIN supply s ON s.day = days.day
ORDER BY days.day;

-- Tripwire check: track TODAY'S orders_per_active_rider (the only heartbeat-accurate row)
-- across daily runs; a sustained value < 1.00 approaching Sep 15 fires the §0a trigger.
