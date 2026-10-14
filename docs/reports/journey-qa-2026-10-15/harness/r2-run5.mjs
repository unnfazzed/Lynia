import * as d from "./drive.mjs"; import { appendFileSync } from "node:fs"; import { execFileSync } from "node:child_process";
const P="postgresql://lynia:lynia@localhost:5432/lynia"; const OUT="docs/reports/journey-qa-2026-10-15/R2-trace.jsonl";
const tr=(step,data)=>appendFileSync(OUT, JSON.stringify({ts:new Date().toISOString(),scenario:"S2b-lapsed-bidder-listing",step,...data})+"\n");
const lg=async p=>{const l=await d.login(p);const m=await d.me(l.token);return{token:l.token,id:m.json.profileId}};
const C=(await lg("+263772222222")).token,b2=await lg("+263774444445"),b3=await lg("+263774444446");
for(const b of[b2,b3]){await d.online(b.token);await d.heartbeat(b.token)}
const oid=(await d.createSend(C)).json.id; await d.bid(b2.token,oid); await d.bid(b3.token,oid);
execFileSync("psql", [P, "-v", `pid=${b3.id}`, "-qc", "update riders set last_heartbeat_at=now()-interval '30 minutes' where profile_id=:'pid'"]);
const l=await d.listOffers(C,oid); tr("offers listed to customer after b3 lapsed",{n:l.json.length, riders:l.json.map(o=>o.rider.profileId===b3.id?"b3(lapsed)":"b2"), fields:Object.keys(l.json[0]).join(",")});
const dl = await d.call("POST","/riders/heartbeat",{token:b3.token,body:{lat:-17.8292,lng:31.0522},expect:false}); tr("b3 heartbeat resumes",{status:dl.status});
