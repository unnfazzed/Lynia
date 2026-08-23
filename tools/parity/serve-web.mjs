#!/usr/bin/env node
/**
 * Bring up a Next.js dev server for a web surface so the web renderer / pair driver can screenshot it.
 *
 *   node serve-web.mjs admin       # http://127.0.0.1:4311
 *   node serve-web.mjs merchant    # http://127.0.0.1:4312
 *
 * Runs `next dev` in the app dir. In dev the admin auth gate is OFF (middleware only enforces in
 * production), and with API_BASE_URL unset the pages render their offline/empty state instead of
 * crashing — a faithful render of the console/tablet shell with no API, DB or auth to stand up. Point
 * PARITY_ADMIN_URL / PARITY_MERCHANT_URL elsewhere to shoot a fully-seeded instance instead.
 *
 * Stays in the foreground; Ctrl-C to stop (or run it with the harness's background flag).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

const APPS = {
  admin: { dir: resolve(REPO, "apps/admin"), port: 4311 },
  merchant: { dir: resolve(REPO, "apps/merchant"), port: 4312 },
};

const which = process.argv[2];
const app = APPS[which];
if (!app) {
  console.error("usage: serve-web.mjs <admin|merchant>");
  process.exit(2);
}

// #674 seeded parity: API_BASE_URL is forwarded (env spread below) — set it to a seeded, migrated
// instance (a local api on :3000 after `pnpm db:seed`, or a hosted PARITY_MERCHANT_URL/PARITY_ADMIN_URL
// backend) to render POPULATED merchant-tablet + admin states; leave it unset for the offline shell.
const seededApi = process.env.API_BASE_URL;
console.error(
  seededApi
    ? `serve-web ${which} on :${app.port} → seeded API_BASE_URL=${seededApi} (populated states)`
    : `serve-web ${which} on :${app.port} → API_BASE_URL unset (offline shell; set it + \`pnpm db:seed\` for populated states)`,
);

// --webpack: both apps compile `@lynia/shared` (ESM source) via transpilePackages, and Next 16's
// default Turbopack dev mis-labels it CommonJS ("module format … not matching") → 500 on every page.
// The apps' own build scripts use `next build --webpack` for the same reason; match that in dev.
const child = spawn("npx", ["next", "dev", "--webpack", "-p", String(app.port), "-H", "127.0.0.1"], {
  cwd: app.dir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    ADMIN_CONSOLE_REQUIRE_AUTH: "false",
    // CF (crash-fuzz 2026-08-23): merchant talks to the API straight from the BROWSER
    // (app/lib/config.ts), which only ever reads the NEXT_PUBLIC_-prefixed, build-time-inlined var —
    // never the plain API_BASE_URL this script forwards for admin's server-side proxy. Without this,
    // "point API_BASE_URL at a seeded instance for populated states" (the comment above) silently did
    // nothing for merchant: its client bundle kept the `http://localhost:3000` fallback baked in, so
    // every browser call 404'd/ECONNREFUSED'd against nothing while admin worked fine — confirmed live
    // (curl on the served bundle, and every `/auth/otp/request` failing `ERR_CONNECTION_REFUSED`).
    ...(seededApi && which === "merchant" ? { NEXT_PUBLIC_API_BASE_URL: seededApi } : {}),
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
