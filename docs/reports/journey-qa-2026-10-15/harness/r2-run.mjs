// R2 scenarios. NODE_PATH=apps/mobile/node_modules ADMIN_JWT=... node r2-run.mjs  -> writes R2-trace.jsonl
import { writeFileSync, appendFileSync } from "node:fs";
import * as d from "./drive.mjs";
const OUT = process.env.TRACE ?? "docs/reports/journey-qa-2026-10-15/R2-trace.jsonl";
writeFileSync(OUT, "");
const tr = (scenario, step, data) => appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), scenario, step, ...data }) + "\n");
const R = async (scenario, step, p) => { const r = await p.catch((e) => ({ status: e.status, json: e.body, err: e.message })); tr(scenario, step, { status: r.status, ms: r.ms, body: JSON.stringify(r.json)?.slice(0, 400) }); return r; };
const attach = (scenario, who, l) => { const t0 = Date.now(); for (const ev of ["order:status","position","connect","disconnect","connect_error"]) l.socket.on(ev, (data) => tr(scenario, `ws:${who}:${ev}`, { data: JSON.stringify(data)?.slice(0, 300) })); };
const mkBiker = async (phone, n) => { const b = await d.login(phone); await d.setName(b.token, "Biker" + n, "QA"); const bec = await d.become(b.token, {}).catch(e=>({err:e.message})); await d.online(b.token); await d.heartbeat(b.token); const prof = await d.me(b.token); return { token: b.token, id: prof.json.profileId, bec }; };
const cust = await d.login("+263772222222"); const C = cust.token;
const b1 = await mkBiker("+263774444444", 1), b2 = await mkBiker("+263774444445", 2), b3 = await mkBiker("+263774444446", 3);
tr("setup", "bikers", { ids: [b1.id, b2.id, b3.id], becomeErr: [b1.bec.err, b2.bec.err] });
const idOf = (r) => r.json?.id ?? r.json?.order?.id;
const offersOf = (r) => r.json?.offers ?? r.json;

// S1: two bikers bid at once, customer selects one; loser tries to stage
{ const s = "S1-two-bidders"; const o = await R(s, "createSend", d.createSend(C)); const oid = idOf(o);
  const lc = await d.listen(C, oid, { log: false }); attach(s, "cust", lc);
  const l1 = await d.listen(b1.token, oid, { log: false }); attach(s, "b1", l1);
  const l2 = await d.listen(b2.token, oid, { log: false }); attach(s, "b2", l2);
  const [x, y] = await Promise.all([R(s, "bid b1", d.bid(b1.token, oid)), R(s, "bid b2", d.bid(b2.token, oid, { type: "counter", offeredFare: 4 }))]);
  const ol = await R(s, "listOffers", d.listOffers(C, oid)); const offs = offersOf(ol);
  const win = offs.find((f) => (f.riderId ?? f.rider?.id) === b1.id) ?? offs[0];
  const [sel1, sel2] = await Promise.all([R(s, "select A", d.select(C, oid, offs[0].id)), R(s, "select B (concurrent)", d.select(C, oid, offs[1].id))]);
  const winTok = [sel1, sel2].find((r) => r.status === 200 || r.status === 201) ? null : null;
  const g1 = await R(s, "b1 GET order", d.getOrder(b1.token, oid)); const g2 = await R(s, "b2 GET order", d.getOrder(b2.token, oid));
  const st1 = await R(s, "b1 stage confirmed", d.stage(b1.token, oid, "confirmed")); const st2 = await R(s, "b2 stage confirmed", d.stage(b2.token, oid, "confirmed"));
  const bd = await R(s, "b3 board after assign", d.board(b3.token)); tr(s, "board-contains-taken", { v: JSON.stringify(bd.json).includes(oid) });
  const a = await R(s, "b1 active-orders", d.call("GET", "/orders/mine/active-orders", { token: b1.token, expect: false }));
  const a2 = await R(s, "b2 active-orders", d.call("GET", "/orders/mine/active-orders", { token: b2.token, expect: false }));
  await new Promise((r) => setTimeout(r, 800)); [lc, l1, l2].forEach((l) => l.close()); globalThis.S1 = oid; }

// S2: stale heartbeat selection
{ const s = "S2-stale-heartbeat"; const o = await R(s, "createSend", d.createSend(C)); const oid = idOf(o);
  await R(s, "bid b3", d.bid(b3.token, oid)); const offs = offersOf(await d.listOffers(C, oid));
  await d.call("PSQL", "/x", { expect: false }).catch(() => {});
  const { execFileSync } = await import("node:child_process");
  try { execFileSync("psql", ["postgresql://lynia:lynia@localhost:5432/lynia", "-v", `pid=${b3.id}`, "-qc", "update riders set last_heartbeat_at = now() - interval '30 minutes' where profile_id = :'pid'"], { stdio: "ignore" }); } catch {}
  const cols = execFileSync("psql", ["postgresql://lynia:lynia@localhost:5432/lynia", "-tAc", "select column_name from information_schema.columns where table_name='riders' and column_name like '%heart%'"]).toString().trim(); tr(s, "rider-cols", { cols });
  const sel = await R(s, "select stale", d.select(C, oid, offs[0].id)); }
console.log("done S1,S2");
