// R3 JQ-R3-01: the app's top-up idempotency key is deterministic across screen mounts, the server replays any
// prior intent for (rider,key) forever. Uses uuidV4FromSeed copied VERBATIM from apps/mobile/src/util.ts:37-52.
import { execSync } from "node:child_process";
import * as d from "./drive.mjs";
function uuidV4FromSeed(seed) {
  const words = [0x811c9dc5, 0x811c9dc5, 0x811c9dc5, 0x811c9dc5];
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i); const w = i % 4; const nw = (w + 1) % 4;
    words[w] = Math.imul((words[w] ?? 0) ^ c, 0x01000193) >>> 0;
    words[nw] = ((words[nw] ?? 0) + ((c << (i % 24)) | 0)) >>> 0;
  }
  const chars = words.map((w) => (w >>> 0).toString(16).padStart(8, "0")).join("").split("");
  chars[12] = "4"; chars[16] = ((parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const s = chars.join(""); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
const sql = (q) => execSync(`psql -h localhost -U lynia -d lynia -tAc "${q}"`, { env: process.env }).toString().trim();
const ph = "+2637" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);
const b = await d.login(ph); await d.setName(b.token); await d.become(b.token);
const phone = "0771234567";
// Mount #1: attempt=0, default amount "5.00"
const k1 = uuidV4FromSeed(`topup|0|5.00|${phone}|ecocash`);
const t1 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 5, rail: "ecocash", phone, idempotencyKey: k1 } });
console.log("mount1", t1.json.id, t1.json.status);
// Emulate the rail confirming it (stub rail never does): same effect as creditFromTopup / Paynow webhook.
const rid = (await d.me(b.token)).json.profileId;
await d.call("POST", `/admin/riders/${rid}/wallet-credit`, { token: d.adminJwt(), body: { amount: 5, rail: "manual", idempotencyKey: crypto.randomUUID() } }); // balance=5 (stands in for the paid top-up)
sql(`update top_ups set status='confirmed', resolved_at=now() where id='${t1.json.id}'`);
// A week later: biker opens Top up again, leaves defaults. Fresh mount => attempt=0 => SAME key.
const k2 = uuidV4FromSeed(`topup|0|5.00|${phone}|ecocash`);
const t2 = await d.call("POST", "/wallet/topups", { token: b.token, body: { amount: 5, rail: "ecocash", phone, idempotencyKey: k2 } });
console.log("keys_equal", k1 === k2, "mount2", t2.json.id, t2.json.status, "same_intent", t1.json.id === t2.json.id);
console.log("poll", JSON.stringify((await d.call("GET", `/wallet/topups/${t2.json.id}`, { token: b.token })).json));
console.log("topups_rows", sql(`select count(*) from top_ups where rider_id='${rid}' and rail='ecocash'`));
