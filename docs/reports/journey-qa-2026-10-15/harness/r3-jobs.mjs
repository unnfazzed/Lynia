// R3: free-job boundary (job 10 free, job 11 debit) + concurrent-jobs overdraft probe. Needs ADMIN_JWT, PGPASSWORD=lynia.
import { execFileSync } from "node:child_process";
import * as d from "./drive.mjs";
const sql = (q) => execFileSync("psql", ["-h", "localhost", "-U", "lynia", "-d", "lynia", "-tAc", q], { env: process.env }).toString().trim();
const show = (k, v) => console.log(k, JSON.stringify(v));
async function mkBiker(trips, creditAmt) {
  const ph = "+2637" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);
  const b = await d.login(ph); await d.setName(b.token); await d.become(b.token);
  const rid = (await d.me(b.token)).json.profileId;
  sql(`update riders set trips_count=${trips} where profile_id='${rid}'`);
  if (creditAmt) await d.credit(rid, creditAmt);
  await d.online(b.token); await d.heartbeat(b.token);
  return { b, rid, ph };
}
async function run(cust, bk, fare) {
  const o = await d.createSend(cust.token, { fare }); const oid = o.json.id ?? o.json.order?.id;
  await d.heartbeat(bk.b.token);
  const bd = await d.bid(bk.b.token, oid, { offeredFare: fare }).catch((e) => ({ err: e.message }));
  if (bd.err) return { oid, err: "bid: " + bd.err };
  const offers = (await d.listOffers(cust.token, oid)).json; const offerId = (offers.offers ?? offers)[0].id;
  const sel = await d.select(cust.token, oid, offerId).catch((e) => ({ err: e.message }));
  if (sel.err) return { oid, err: "select: " + sel.err };
  return { oid };
}
async function finish(cust, bk, oid) {
  for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]) await d.stage(bk.b.token, oid, to);
  const code = (await d.revealCode(cust.token, oid)).json; await d.deliver(bk.b.token, oid, code.code ?? code.deliveryCode);
  await d.rate(cust.token, oid, 5);
}
const cust = await d.login("+263772222222");
// A: trips=9, job10 free, job11 paid
const A = await mkBiker(9, 5);
for (const n of [10, 11]) {
  const r = await run(cust, A, 3); if (r.err) { show("A.err", r); break; }
  await finish(cust, A, r.oid);
  show(`A.after_job${n}`, { wallet: (await d.wallet(A.b.token)).json.balance, trips: sql(`select trips_count from riders where profile_id='${A.rid}'`) });
}
show("A.ledger", (await d.ledger(A.b.token)).json.entries.map((e) => [e.type, e.amount, e.balanceAfter, e.title, e.meta]));
// B: trips=10, balance 0.60; fare 5 -> commission 0.50 each; hold 3 concurrently
const B = await mkBiker(10, 0.6);
const held = [];
for (let i = 0; i < 3; i++) { const r = await run(cust, B, 5); show(`B.hold${i + 1}`, r); if (!r.err) held.push(r.oid); }
for (const oid of held) await finish(cust, B, oid);
show("B.wallet_final", (await d.wallet(B.b.token)).json);
show("B.ledger", (await d.ledger(B.b.token)).json.entries.map((e) => [e.type, e.amount, e.balanceAfter]));
// C: trips=10, balance 0 -> bid refusal text
const C = await mkBiker(10, 0);
const o = await d.createSend(cust.token, { fare: 5 }); const oid = o.json.id ?? o.json.order?.id;
const refused = await d.call("POST", `/orders/${oid}/offers`, { token: C.b.token, body: { type: "accept", offeredFare: 5, etaMinutes: 8 }, expect: false });
show("C.bid_refusal", { status: refused.status, body: refused.json });
show("integrity", (await d.call("POST", "/admin/wallet/integrity-check", { token: d.adminJwt() })).json);
