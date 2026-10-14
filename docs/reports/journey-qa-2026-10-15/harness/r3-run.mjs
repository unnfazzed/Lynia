// R3 wallet live run. NODE_PATH=apps/mobile/node_modules ADMIN_JWT=... node r3-run.mjs
import { randomUUID } from "node:crypto";
import * as d from "./drive.mjs";
const out = {};
const P = (k, v) => { out[k] = v; console.log(k, JSON.stringify(v)); };
const ph = "+2637" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);
const cust = await d.login("+263772222222");
const b = await d.login(ph); await d.setName(b.token); const bec = await d.become(b.token);
const meJ = (await d.me(b.token)).json; console.log("ME", Object.keys(meJ)); const rid = meJ.profileId;
P("biker", { ph, rid, become: bec.json?.kyc ?? bec.json?.status ?? Object.keys(bec.json) });
P("wallet0", (await d.wallet(b.token)).json);
P("config", (await d.call("GET", "/wallet/config", { token: b.token })).json);
// stub top-up
const key = randomUUID();
const t1 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 10, rail: "ecocash", phone: "+263771234567", idempotencyKey: key } });
const t2 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 10, rail: "ecocash", phone: "+263771234567", idempotencyKey: key } });
P("topup_same_key", { same: t1.json.id === t2.json.id, t1: t1.json });
const t3 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 10, rail: "ecocash", phone: "+263771234567", idempotencyKey: key } , expect:false});
const t4 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 999, rail: "ecocash", phone: "+263771234567" }, expect:false});
P("topup_clamp_999", { status: t4.status, amount: t4.json.amount, charged: t4.json.charged });
const t5 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 1, rail: "innbucks", phone: "+263771234567" }, expect:false});
P("topup_innbucks_min", { status: t5.status, body: t5.json });
const t6 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 10, rail: "ecocash", phone: "+263771234567", idempotencyKey: randomUUID() }, expect:false});
P("topup_poll_0s", (await d.call("GET", `/wallet/topups/${t6.json.id}`, { token: b.token })).json.status);
if (!process.env.NOWAIT) await new Promise(r => setTimeout(r, 92000));
P("topup_poll_92s", (await d.call("GET", `/wallet/topups/${t6.json.id}`, { token: b.token })).json);
P("topup_replay_after_expiry", (await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 10, rail: "ecocash", phone: "+263771234567", idempotencyKey: key }, expect:false })).json);
// admin credit idempotency
const ik = randomUUID();
const c1 = await d.call("POST", `/admin/riders/${rid}/wallet-credit`, { token: d.adminJwt(), body: { amount: 20, rail: "manual", idempotencyKey: ik } });
const c2 = await d.call("POST", `/admin/riders/${rid}/wallet-credit`, { token: d.adminJwt(), body: { amount: 20, rail: "manual", idempotencyKey: ik }, expect:false });
P("credit_replay", { c1: c1.json, c2: c2.status + JSON.stringify(c2.json), wallet: (await d.wallet(b.token)).json });
// cap
const caps = [];
for (let i=0;i<4;i++){ const r = await d.call("POST", `/admin/riders/${rid}/wallet-credit`, { token: d.adminJwt(), body: { amount: 50, rail: "manual", idempotencyKey: randomUUID() }, expect:false}); caps.push([r.status, JSON.stringify(r.json).slice(0,160)]); }
P("credit_cap", caps);
P("wallet_after_cap", (await d.wallet(b.token)).json);
P("ledger", (await d.ledger(b.token)).json);
P("integrity", (await d.call("POST","/admin/wallet/integrity-check",{token:d.adminJwt()})).json);
console.log("TIMINGS", JSON.stringify(d.timings.filter(t=>t.call.includes("wallet")).map(t=>`${t.call}:${t.status}:${t.ms}`)));
