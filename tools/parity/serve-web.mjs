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

// --webpack: both apps compile `@lynia/shared` (ESM source) via transpilePackages, and Next 16's
// default Turbopack dev mis-labels it CommonJS ("module format … not matching") → 500 on every page.
// The apps' own build scripts use `next build --webpack` for the same reason; match that in dev.
const child = spawn("npx", ["next", "dev", "--webpack", "-p", String(app.port), "-H", "127.0.0.1"], {
  cwd: app.dir,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development", ADMIN_CONSOLE_REQUIRE_AUTH: "false" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
