// R3: what happens server-side when a biker with an active job goes offline (the app's switchToCustomer(false) path).
import * as d from "./drive.mjs";
const cust = await d.login("+263772222222");
const ph = "+2637" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);
const b = await d.login(ph); await d.setName(b.token); await d.become(b.token);
await d.online(b.token); await d.heartbeat(b.token);
const o = await d.createSend(cust.token, { fare: 3 }); const oid = o.json.id ?? o.json.order?.id;
await d.bid(b.token, oid);
const offers = (await d.listOffers(cust.token, oid)).json; await d.select(cust.token, oid, (offers.offers ?? offers)[0].id);
const off = await d.call("PATCH", "/riders/online", { token: b.token, body: { online: false } });
console.log("offline_midjob", off.status, JSON.stringify(off.json));
const hb = await d.call("POST", "/riders/heartbeat", { token: b.token, body: { lat: -17.83, lng: 31.05 }, expect: false });
console.log("heartbeat_after_offline", hb.status, JSON.stringify(hb.json));
for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]) {
  const r = await d.call("POST", `/orders/${oid}/status`, { token: b.token, body: { to }, expect: false }); console.log("stage", to, r.status, JSON.stringify(r.json).slice(0, 120));
}
const code = (await d.revealCode(cust.token, oid)).json;
const dl = await d.call("POST", `/orders/${oid}/deliver`, { token: b.token, body: { code: code.code ?? code.deliveryCode }, expect: false }); console.log("deliver", dl.status);
const a = await d.call("GET", "/orders/mine/active-orders", { token: cust.token }); 
console.log("active_orders", a.status, JSON.stringify(a.json).slice(0, 200));
