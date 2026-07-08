// Test-fixture constants shared by every counterparty script. Coordinates match the same Harare CBD
// corridor apps/api/prisma/seed.ts seeds with, so orders created here pass the SERVICE_CORRIDOR gate
// (packages/shared/src/policy.ts) without needing a live Places lookup.
const PICKUP_CONTACT = (typeof CUSTOMER_PHONE !== "undefined" && CUSTOMER_PHONE) || "+263771234567";
const DROPOFF_CONTACT = (typeof RIDER_PHONE !== "undefined" && RIDER_PHONE) || "+263770000002";

const PICKUP = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Eastgate Mall, CBD", contactPhone: PICKUP_CONTACT };
const DROPOFF = { point: { lat: -17.8192, lng: 31.0622 }, landmark: "14 Glenara Ave, Avenues", contactPhone: DROPOFF_CONTACT };
const ASK_FARE = 3;
const COUNTER_FARE = 4.5;
const ETA_MINUTES = 8;

module.exports = { PICKUP, DROPOFF, ASK_FARE, COUNTER_FARE, ETA_MINUTES };
