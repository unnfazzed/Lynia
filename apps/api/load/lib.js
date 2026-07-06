// Shared helpers for the Lynia k6 load harness (docs/LOAD-MODEL.md). Standalone k6 JS — not part of the
// TS build. Targets a STAGING deploy in QA mode (OTP_CHANNEL=console + OTP_TEST_PHONES), never the live
// pilot. All request shapes mirror packages/shared/src/contracts.ts.
import http from "k6/http";
import { check } from "k6";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
export const STRESS = Number(__ENV.STRESS || 1); // 1× steady, 5 = the stress multiple

// Harare service corridor centre (packages/shared SERVICE_CORRIDOR) — jitter within a few hundred metres
// so pickups/drop-offs are corridor-valid but not identical.
const CENTER = { lat: -17.8292, lng: 31.0522 };
export function nearbyPoint() {
  return { lat: CENTER.lat + (Math.random() - 0.5) * 0.05, lng: CENTER.lng + (Math.random() - 0.5) * 0.05 };
}

export function json(res) {
  try {
    return res.json();
  } catch (_e) {
    return null;
  }
}

/**
 * OTP sign-in against QA mode: POST /auth/otp/request returns { devCode } for an OTP_TEST_PHONES number,
 * then POST /auth/otp/verify exchanges it for tokens. Returns { accessToken } or null on failure.
 */
export function signIn(phone) {
  const req = http.post(`${BASE_URL}/auth/otp/request`, JSON.stringify({ phone }), {
    headers: { "Content-Type": "application/json" },
  });
  const code = json(req)?.devCode;
  if (!code) return null; // staging isn't in QA mode / phone not allow-listed
  const ver = http.post(`${BASE_URL}/auth/otp/verify`, JSON.stringify({ phone, code }), {
    headers: { "Content-Type": "application/json" },
  });
  return json(ver)?.accessToken ? { accessToken: json(ver).accessToken } : null;
}

export function auth(token) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

export function createOrder(token) {
  const p = nearbyPoint();
  const d = nearbyPoint();
  const body = {
    pickup: { point: p, landmark: "Load pickup", contactPhone: "+263770000001" },
    dropoff: { point: d, landmark: "Load dropoff", contactPhone: "+263770000002" },
    itemDescription: "Load-test parcel",
    declaredValue: 20,
    proposedFare: 5.0,
  };
  const res = http.post(`${BASE_URL}/orders`, JSON.stringify(body), auth(token));
  check(res, { "order created (201)": (r) => r.status === 201 });
  return json(res)?.id ?? null;
}

export function makeOffer(token, orderId, fare) {
  const res = http.post(
    `${BASE_URL}/orders/${orderId}/offers`,
    JSON.stringify({ type: "accept", offeredFare: fare, etaMinutes: 10 }),
    auth(token),
  );
  return { status: res.status, id: json(res)?.id ?? null };
}

export function selectOffer(token, orderId, offerId) {
  return http.post(`${BASE_URL}/orders/${orderId}/offers/${offerId}/select`, null, auth(token));
}
