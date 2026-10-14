// Journey QA driver. Import the helpers; never rewrite them. Run directly for the R0 happy path:
//   NODE_PATH=apps/mobile/node_modules ADMIN_JWT=... node drive.mjs
import { randomUUID } from "node:crypto";
export const API = process.env.API ?? "http://localhost:3000";
export const timings = [];
export async function call(method, path, { token, body, headers = {}, expect } = {}) {
  const t = performance.now();
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t);
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  timings.push({ call: `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, status: res.status, ms });
  if (expect !== false && !res.ok) { const e = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`); e.status = res.status; e.body = json; throw e; }
  return { status: res.status, ms, json };
}
export async function login(phone, deviceId = `qa-${phone}`) {
  const r = await call("POST", "/auth/otp/request", { body: { phone } });
  const v = await call("POST", "/auth/otp/verify", { body: { phone, code: r.json.devCode }, headers: { "x-device-id": deviceId } });
  return { token: v.json.accessToken ?? v.json.tokens?.accessToken, refresh: v.json.refreshToken ?? v.json.tokens?.refreshToken, raw: v.json };
}
export const adminJwt = () => process.env.ADMIN_JWT;
export const setName = (token, firstName = "QA", lastName = "Tester") => call("PATCH", "/auth/me", { token, body: { firstName, lastName } });
export const me = (token) => call("GET", "/auth/me", { token });
export const become = (token, body = {}) => call("POST", "/riders/become", { token, body });
export const credit = (riderProfileId, amount = 20) =>
  call("POST", `/admin/riders/${riderProfileId}/wallet-credit`, { token: adminJwt(), body: { amount, rail: "manual", idempotencyKey: randomUUID() } });
export const online = (token, lat = -17.8292, lng = 31.0522) => call("PATCH", "/riders/online", { token, body: { online: true, lat, lng } });
export const heartbeat = (token, lat = -17.8292, lng = 31.0522) => call("POST", "/riders/heartbeat", { token, body: { lat, lng } });
export const createSend = (token, { fare = 3, pickup = [-17.8292, 31.0522], dropoff = [-17.8, 31.06], key = randomUUID() } = {}) =>
  call("POST", "/orders", { token, body: {
    pickup: { point: { lat: pickup[0], lng: pickup[1] }, landmark: "QA pickup", contactPhone: "+263772222222" },
    dropoff: { point: { lat: dropoff[0], lng: dropoff[1] }, landmark: "QA dropoff", contactPhone: "+263772222223" },
    items: [{ description: "Documents", quantity: 1 }], declaredValue: 10, proposedFare: fare, idempotencyKey: key } });
export const board = (token, lat = -17.8292, lng = 31.0522, radiusM = 20000) => call("GET", `/orders/open?lat=${lat}&lng=${lng}&radiusM=${radiusM}`, { token });
export const bid = (token, orderId, { type = "accept", offeredFare = 3, etaMinutes = 8 } = {}) => call("POST", `/orders/${orderId}/offers`, { token, body: { type, offeredFare, etaMinutes } });
export const listOffers = (token, orderId) => call("GET", `/orders/${orderId}/offers`, { token });
export const select = (token, orderId, offerId) => call("POST", `/orders/${orderId}/offers/${offerId}/select`, { token });
export const stage = (token, orderId, to) => call("POST", `/orders/${orderId}/status`, { token, body: { to } });
export const pickupPhoto = (token, orderId, key) => call("POST", `/orders/${orderId}/pickup-photo`, { token, body: { key } });
export const revealCode = (token, orderId) => call("POST", `/orders/${orderId}/delivery-code/reveal`, { token });
export const deliver = (token, orderId, code) => call("POST", `/orders/${orderId}/deliver`, { token, body: { code } });
export const rate = (token, orderId, score = 5) => call("POST", `/orders/${orderId}/rating`, { token, body: { score } });
export const cancel = (token, orderId, reason = "other") => call("POST", `/orders/${orderId}/cancel`, { token, body: { reason } });
export const getOrder = (token, orderId) => call("GET", `/orders/${orderId}`, { token });
export const ledger = (token) => call("GET", "/wallet/ledger", { token });
export const wallet = (token) => call("GET", "/wallet", { token });
/** Socket listener; logs `{t, event, data}` lines. Needs NODE_PATH=apps/mobile/node_modules. Returns {events, close}. */
export async function listen(token, orderId, { log = true } = {}) {
  const { io } = await import("socket.io-client");
  const events = []; const t0 = Date.now();
  const s = io(API, { auth: { token }, transports: ["websocket"] });
  const rec = (event) => (data) => { const e = { t: Date.now() - t0, event, data }; events.push(e); if (log) console.log(JSON.stringify(e)); };
  for (const ev of ["order:status", "position", "connect", "disconnect", "connect_error"]) s.on(ev, rec(ev));
  s.on("connect", () => s.emit("subscribe:order", { orderId }));
  return { events, socket: s, close: () => s.close() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const step = async (name, fn) => { const t = performance.now(); try { const r = await fn(); console.log(`ok   ${name} ${Math.round(performance.now() - t)}ms`); return r; } catch (e) { console.log(`FAIL ${name}: ${e.message}`); throw e; } };
  const cust = await step("customer login", () => login("+263772222222"));
  const c = cust.token;
  await step("customer setName", () => setName(c, "Cust", "QA"));
  const biker = await step("biker login", () => login("+263774444444"));
  const b = biker.token;
  await step("biker setName", () => setName(b, "Biker", "QA"));
  const bec = await step("biker become", () => become(b));
  console.log("become ->", JSON.stringify(bec.json).slice(0, 200));
  await step("biker online", () => online(b));
  await step("biker heartbeat", () => heartbeat(b));
  const order = await step("customer createSend", () => createSend(c));
  const oid = order.json.id ?? order.json.order?.id;
  await step("biker board", async () => { const r = await board(b); console.log("board has order:", JSON.stringify(r.json).includes(oid)); });
  await step("biker bid", () => bid(b, oid));
  const offers = await step("customer listOffers", () => listOffers(c, oid));
  const offerId = (offers.json.offers ?? offers.json)[0].id;
  await step("customer select", () => select(c, oid, offerId));
  for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]) await step(`stage ${to}`, () => stage(b, oid, to));
  const code = await step("customer revealCode", () => revealCode(c, oid));
  const codeStr = code.json.code ?? code.json.deliveryCode;
  await step("biker deliver", () => deliver(b, oid, codeStr));
  await step("customer rate", () => rate(c, oid, 5));
  const o = await getOrder(c, oid); console.log("final status:", o.json.status);
  const l = await ledger(b); console.log("ledger:", JSON.stringify(l.json).slice(0, 600));
  console.log("\nTIMINGS"); console.table(timings);
}
