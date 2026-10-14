// R2 S7: live position stream to the customer (coalescing + trailing edge + non-assigned rider).
import { appendFileSync } from "node:fs"; import * as d from "./drive.mjs";
const OUT = "docs/reports/journey-qa-2026-10-15/R2-trace.jsonl";
const tr = (step, data) => appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), scenario: "S7-position", step, ...data }) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lg = async (p) => { const l = await d.login(p); const m = await d.me(l.token); return { token: l.token, id: m.json.profileId }; };
const C = (await lg("+263772222222")).token, b1 = await lg("+263774444444"), b2 = await lg("+263774444445");
await d.online(b1.token); await d.heartbeat(b1.token);
const oid = (await d.createSend(C)).json.id; await d.bid(b1.token, oid); const offs = (await d.listOffers(C, oid)).json; await d.select(C, oid, offs[0].id);
for (const t of ["confirmed", "en_route_pickup"]) await d.stage(b1.token, oid, t);
const lc = await d.listen(C, oid, { log: false }); const t0 = Date.now(); lc.socket.on("position", (p) => tr("customer got position", { tMs: Date.now() - t0, lat: p.lat, lng: p.lng }));
const lr = await d.listen(b1.token, oid, { log: false }); const lx = await d.listen(b2.token, oid, { log: false }); await sleep(400);
const ack = (s, who, lat) => new Promise((res) => s.emit("rider:location", { orderId: oid, lat, lng: 31.05 }, (a) => { tr("ack " + who, { a: JSON.stringify(a), lat }); res(); }));
for (const lat of [-17.83, -17.831, -17.832, -17.833, -17.834]) await ack(lr.socket, "assigned", lat);
await ack(lx.socket, "NOT-assigned b2", -17.9); await sleep(1500);
const sub = await new Promise((res) => lx.socket.emit("subscribe:order", { orderId: oid }, (a) => res(a))); tr("b2 subscribe:order ack", { a: JSON.stringify(sub) });
await d.deliver(b1.token, oid, (await d.revealCode(C, oid)).json.deliveryCode); await d.rate(C, oid, 5);
[lc, lr, lx].forEach((l) => l.close());
