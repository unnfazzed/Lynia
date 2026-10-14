// R2 scenarios part 2 (appends to R2-trace.jsonl; run after r2-run.mjs). Needs ADMIN_JWT, DATABASE_URL-less (psql via URL below).
import { appendFileSync } from "node:fs"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module";
import * as d from "./drive.mjs";
const OUT = process.env.TRACE ?? "docs/reports/journey-qa-2026-10-15/R2-trace.jsonl";
const PG = "postgresql://lynia:lynia@localhost:5432/lynia"; const sql = (q) => execFileSync("psql", [PG, "-tAc", q]).toString().trim();
const tr = (scenario, step, data) => appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), scenario, step, ...data }) + "\n");
const R = async (s, step, p) => { const r = await p.catch((e) => ({ status: e.status, json: e.body, err: e.message })); tr(s, step, { status: r.status, ms: r.ms, body: JSON.stringify(r.json)?.slice(0, 500) }); return r; };
const attach = (s, who, l) => { for (const ev of ["order:status","position","connect","disconnect","connect_error","order:taken","job:cancelled","bid:expired","offers:changed","presence:stale","presence:recovered","order:rebroadcast"]) l.socket.on(ev, (data) => tr(s, `ws:${who}:${ev}`, { data: JSON.stringify(data)?.slice(0, 300) })); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = async (p) => { const l = await d.login(p); const m = await d.me(l.token); return { token: l.token, id: m.json.profileId }; };
const C = (await login("+263772222222")).token; const b1 = await login("+263774444444"), b2 = await login("+263774444445"), b3 = await login("+263774444446");
for (const b of [b1, b2, b3]) { await d.online(b.token); await d.heartbeat(b.token); }
const idOf = (r) => r.json?.id; const offs = async (oid) => (await d.listOffers(C, oid)).json;
const mine = (b) => d.call("GET", "/orders/mine/active", { token: b.token, expect: false });

// S0: how the selected + losing bidder learn the outcome (board:subscribe + order:taken + GET /orders/mine/active)
{ const s = "S0-bidder-learns"; const oid = idOf(await R(s, "createSend", d.createSend(C)));
  const w1 = await d.listen(b1.token, oid, { log: false }), w2 = await d.listen(b2.token, oid, { log: false }); attach(s, "b1", w1); attach(s, "b2", w2);
  for (const w of [w1, w2]) w.socket.emit("board:subscribe", { lat: -17.8292, lng: 31.0522 });
  await d.bid(b1.token, oid); await d.bid(b2.token, oid); const o = await offs(oid);
  await R(s, "b1 /mine/active BEFORE select", mine(b1));
  const win = o.find((x) => x.rider.profileId === b1.id); await R(s, "select b1", d.select(C, oid, win.id));
  await sleep(700); await R(s, "b1 /mine/active AFTER select", mine(b1)); await R(s, "b2 /mine/active AFTER select", mine(b2));
  await R(s, "b2 offer status via GET offers/mine?", d.call("GET", `/orders/${oid}`, { token: b2.token, expect: false }));
  // S3 reuse this order: chosen biker cancels
  const lc = await d.listen(C, oid, { log: false }); attach("S3-biker-cancels", "cust", lc); await sleep(300);
  await R("S3-biker-cancels", "stage confirmed", d.stage(b1.token, oid, "confirmed"));
  await R("S3-biker-cancels", "biker cancel", d.cancel(b1.token, oid, "other"));
  await sleep(500); const od = await R("S3-biker-cancels", "customer GET order", d.getOrder(C, oid)); await R("S3-biker-cancels", "cust active-orders", d.call("GET", "/orders/mine/active-orders", { token: C, expect: false }));
  tr("S3-biker-cancels", "rider-row", { row: sql(`select is_online,cancel_strikes,cooldown_until,reliability_score from riders where profile_id='${b1.id}'`) });
  tr("S3-biker-cancels", "order-row", { row: sql(`select status,rider_id from orders where id='${oid}'`) });
  [w1, w2, lc].forEach((l) => l.close()); }
await d.online(b1.token); await d.heartbeat(b1.token);

// S4: wrong code x5 then right code; S5 double deliver / double rate; commission on a paid job
sql(`update riders set trips_count=10 where profile_id='${b1.id}'`);
await R("S5-commission", "credit b1 $5", d.credit(b1.id, 5));
const w0 = (await d.wallet(b1.token)).json; tr("S5-commission", "wallet before", { w: JSON.stringify(w0).slice(0, 300) });
{ const s = "S4-wrong-code"; const oid = idOf(await d.createSend(C, { fare: 3 })); await d.bid(b1.token, oid); const o = await offs(oid);
  await d.select(C, oid, o[0].id); for (const t of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]) await d.stage(b1.token, oid, t);
  const code = (await d.revealCode(C, oid)).json.deliveryCode; const bad = code === "111111" ? "222222" : "111111";
  for (let i = 1; i <= 6; i++) await R(s, `wrong #${i}`, d.deliver(b1.token, oid, bad));
  await R(s, "ORIGINAL right code after lockout", d.deliver(b1.token, oid, code));
  const rot = await R(s, "customer rotate code", d.call("POST", `/orders/${oid}/delivery-code/rotate`, { token: C, expect: false }));
  await R(s, "right code after rotate", d.deliver(b1.token, oid, rot.json.deliveryCode)); await R(s, "rate", d.rate(C, oid, 5));
  tr(s, "order-row", { row: sql(`select status,delivery_attempts from orders where id='${oid}'`) }); globalThis.S4 = { oid, code }; }
{ const s = "S5-commission"; const oid = idOf(await d.createSend(C, { fare: 3 })); await d.bid(b1.token, oid); const o = await offs(oid);
  await d.select(C, oid, o[0].id); for (const t of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]) await d.stage(b1.token, oid, t);
  const code = (await d.revealCode(C, oid)).json.deliveryCode;
  const [x, y] = await Promise.all([R(s, "deliver A", d.deliver(b1.token, oid, code)), R(s, "deliver B (concurrent)", d.deliver(b1.token, oid, code))]);
  await R(s, "deliver C (after)", d.deliver(b1.token, oid, code));
  await R(s, "wallet after deliver", d.wallet(b1.token));
  const [r1, r2] = await Promise.all([R(s, "rate A", d.rate(C, oid, 5)), R(s, "rate B (concurrent)", d.rate(C, oid, 4))]);
  await R(s, "rate C", d.rate(C, oid, 3)); await R(s, "wallet after rate", d.wallet(b1.token)); await R(s, "ledger", d.ledger(b1.token));
  tr(s, "rows", { rider: sql(`select trips_count from riders where profile_id='${b1.id}'`), led: sql(`select count(*)||' rows, kinds='||coalesce(string_agg(distinct type::text,','),'') from commission_ledger where order_id='${oid}'`) }); }
