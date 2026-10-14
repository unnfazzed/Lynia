// R2 S6: socket token-expiry behaviour. Mints a 6 s access token for biker 1 and watches the server close it.
import { appendFileSync } from "node:fs"; import { createRequire } from "node:module"; import { execSync } from "node:child_process";
import * as d from "./drive.mjs"; const OUT = "docs/reports/journey-qa-2026-10-15/R2-trace.jsonl";
const tr = (step, data) => appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), scenario: "S6-token-expiry", step, ...data }) + "\n");
const { io } = await import("socket.io-client"); const require = createRequire("/home/user/Lynia/apps/api/package.json"); const jwt = require("jsonwebtoken");
const l = await d.login("+263774444444"); const claims = jwt.decode(l.token); tr("claims", { claims: JSON.stringify(claims) });
const short = jwt.sign({ role: claims.role }, "dev-insecure-secret-change-me-please", { subject: claims.sub, expiresIn: 6, algorithm: "HS256" });
let tokenNow = short; const t0 = Date.now(); const T = () => Date.now() - t0;
const s = io(d.API, { auth: (cb) => cb({ token: tokenNow }), transports: ["websocket"], reconnectionDelay: 500, reconnectionDelayMax: 2000 });
for (const ev of ["connect", "disconnect", "connect_error"]) s.on(ev, (x) => tr(`ws:${ev}`, { tMs: T(), data: JSON.stringify(x instanceof Error ? { message: x.message, data: x.data } : x) }));
s.io.on("reconnect_attempt", (n) => tr("ws:reconnect_attempt", { tMs: T(), n }));
await new Promise((r) => setTimeout(r, 14000));
tr("swap-fresh-token", { tMs: T() }); tokenNow = l.token; await new Promise((r) => setTimeout(r, 4000)); tr("final", { connected: s.connected, tMs: T() }); s.close();
