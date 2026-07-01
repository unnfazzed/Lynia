/**
 * Didit founder wiring — the one non-code step that gates real KYC (see docs/PILOT-READINESS.md §2).
 *
 * The integration itself is built; this script turns the manual runbook into a single command that
 *   1. registers a Didit account programmatically (no browser) and returns the API key,
 *   2. lists the available workflows so you can pick a DIDIT_WORKFLOW_ID,
 *   3. registers the webhook destination and returns its signing secret (DIDIT_WEBHOOK_SECRET),
 * then prints the four values to store in Secret Manager / repo Variables before flipping
 * DIDIT_ENABLED=true.
 *
 * Usage (from apps/api):
 *   pnpm didit:setup                 # full guided flow (register → workflow → webhook)
 *   pnpm didit:setup workflows       # just list workflows (needs DIDIT_API_KEY)
 *   pnpm didit:setup webhook         # just register the webhook destination (needs DIDIT_API_KEY)
 *
 * Inputs come from env (or the interactive prompts). If you already have a key, set DIDIT_API_KEY and
 * the register step is skipped. Nothing here is persisted — copy the printed values into your secret
 * store. This talks to the LIVE Didit API and creates a real account/destination.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const AUTH_BASE = (process.env.DIDIT_AUTH_BASE_URL ?? "https://apx.didit.me").replace(/\/$/, "");
const API_BASE = (process.env.DIDIT_BASE_URL ?? "https://verification.didit.me").replace(/\/$/, "");

const rl = createInterface({ input: stdin, output: stdout });
const ask = (q: string, fallback = ""): Promise<string> =>
  rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `).then((a) => a.trim() || fallback);

/** POST/GET JSON against Didit; throws with status + body snippet (mirrors DiditKycVendor's error style). */
async function call(
  url: string,
  init: { method: "GET" | "POST"; apiKey?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.apiKey) headers["x-api-key"] = init.apiKey;
  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`${init.method} ${url} → non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

/** Read a field that Didit may nest or alias (e.g. api_key at top level or under `application`). */
function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
  }
  const app = obj.application as Record<string, unknown> | undefined;
  if (app) {
    for (const k of keys) {
      const v = app[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return undefined;
}

/**
 * Register a new account (or reuse DIDIT_API_KEY). Didit emails a 6-char code; we prompt for it and
 * exchange it for the API key. Falls back to login if the email is already registered.
 */
async function getApiKey(): Promise<string> {
  const existing = process.env.DIDIT_API_KEY?.trim();
  if (existing) {
    console.log("• Using DIDIT_API_KEY from the environment (skipping registration).");
    return existing;
  }

  const email = process.env.DIDIT_REGISTER_EMAIL || (await ask("Didit account email"));
  const password = process.env.DIDIT_REGISTER_PASSWORD || (await ask("Didit account password"));
  if (!email || !password) throw new Error("email and password are required to register");

  console.log(`• Registering ${email} at ${AUTH_BASE}/auth/v2/programmatic/register/ …`);
  try {
    await call(`${AUTH_BASE}/auth/v2/programmatic/register/`, {
      method: "POST",
      body: { email, password },
    });
    console.log("  → registered; check your inbox for the 6-character verification code.");
  } catch (err) {
    // Already-registered accounts can't re-register — fall through to email verification / login.
    console.log(`  → register returned: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  → if the account already exists, enter its emailed code below, or leave blank to log in.");
  }

  const code = (await ask("Verification code from email (blank to log in with password instead)")).trim();
  if (code) {
    const verified = await call(`${AUTH_BASE}/auth/v2/programmatic/verify-email/`, {
      method: "POST",
      body: { email, code },
    });
    const apiKey = pick(verified, "api_key", "apiKey");
    if (!apiKey) throw new Error(`verify-email succeeded but no api_key in response: ${JSON.stringify(verified).slice(0, 300)}`);
    return apiKey;
  }

  console.log(`• Logging in at ${AUTH_BASE}/auth/v2/programmatic/login/ …`);
  const loggedIn = await call(`${AUTH_BASE}/auth/v2/programmatic/login/`, {
    method: "POST",
    body: { email, password },
  });
  const apiKey = pick(loggedIn, "api_key", "apiKey", "access_token", "access");
  if (!apiKey) throw new Error(`login succeeded but no api_key/token in response: ${JSON.stringify(loggedIn).slice(0, 300)}`);
  return apiKey;
}

/** List workflows so the operator can choose a DIDIT_WORKFLOW_ID (workflow id is config, not a secret). */
async function listWorkflows(apiKey: string): Promise<Array<{ id: string; name: string }>> {
  console.log(`• Listing workflows at ${API_BASE}/v3/workflows/ …`);
  const data = await call(`${API_BASE}/v3/workflows/`, { method: "GET", apiKey });
  const rawList = Array.isArray(data) ? data : (data.workflows ?? data.results ?? data.data ?? []);
  const list = (Array.isArray(rawList) ? rawList : []) as Array<Record<string, unknown>>;
  const workflows = list.map((w) => ({
    id: String(pick(w, "id", "workflow_id", "uuid") ?? ""),
    name: String(pick(w, "name", "label", "title") ?? "(unnamed)"),
  }));
  if (!workflows.length) {
    console.log("  → no workflows returned. Create one in the console, then re-run, or set DIDIT_WORKFLOW_ID manually.");
  } else {
    for (const w of workflows) console.log(`  - ${w.name}: ${w.id}`);
  }
  return workflows;
}

/**
 * Register the webhook destination (idempotent-ish: Didit may reject a duplicate URL — that's fine,
 * the existing destination already has a secret). Returns the signing secret to store as
 * DIDIT_WEBHOOK_SECRET.
 */
async function registerWebhook(apiKey: string, url: string): Promise<string> {
  console.log(`• Registering webhook destination for ${url} …`);
  const data = await call(`${API_BASE}/v3/webhook/destinations/`, {
    method: "POST",
    apiKey,
    body: {
      label: process.env.DIDIT_WEBHOOK_LABEL || "Lynia prod",
      url,
      webhook_version: "v3",
      subscribed_events: ["status.updated"],
    },
  });
  const secret = pick(data, "secret_shared_key", "secret", "signing_secret");
  if (!secret) throw new Error(`webhook created but no secret in response: ${JSON.stringify(data).slice(0, 300)}`);
  return secret;
}

function summary(vals: { apiKey?: string; workflowId?: string; webhookSecret?: string; callbackUrl?: string }): void {
  const mask = (s?: string) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "(unset)");
  console.log("\n──────────── Didit wiring — store these, then flip DIDIT_ENABLED=true ────────────");
  console.log("Secrets → Secret Manager (see docs/PILOT-READINESS.md §2):");
  console.log(`  DIDIT_API_KEY        = ${vals.apiKey ?? "(unset)"}   (${mask(vals.apiKey)})`);
  console.log(`  DIDIT_WEBHOOK_SECRET = ${vals.webhookSecret ?? "(unset)"}   (${mask(vals.webhookSecret)})`);
  console.log("Plain repo Variables:");
  console.log(`  DIDIT_WORKFLOW_ID    = ${vals.workflowId ?? "(unset)"}`);
  console.log(`  DIDIT_CALLBACK_URL   = ${vals.callbackUrl ?? "(optional — post-verification redirect)"}`);
  console.log("\nActivate real KYC:");
  console.log("  gh variable set DIDIT_ENABLED --body true   # then: gh workflow run release.yml --ref main");
  console.log("──────────────────────────────────────────────────────────────────────────────────\n");
}

async function main(): Promise<void> {
  const cmd = (process.argv[2] ?? "all").toLowerCase();
  console.log(`Didit setup (auth: ${AUTH_BASE}, api: ${API_BASE})\n`);

  if (cmd === "workflows") {
    const apiKey = await getApiKey();
    await listWorkflows(apiKey);
    return;
  }

  if (cmd === "webhook") {
    const apiKey = await getApiKey();
    const url =
      process.env.DIDIT_WEBHOOK_URL || (await ask("Webhook URL (your /kyc/callback)", "https://lyniago.lyniafinance.com/kyc/callback"));
    const secret = await registerWebhook(apiKey, url);
    summary({ apiKey, webhookSecret: secret, callbackUrl: process.env.DIDIT_CALLBACK_URL });
    return;
  }

  if (cmd !== "all") {
    console.log(`Unknown command "${cmd}". Use: all | workflows | webhook.`);
    process.exitCode = 1;
    return;
  }

  // Full guided flow.
  const apiKey = await getApiKey();

  const workflows = await listWorkflows(apiKey);
  let workflowId = process.env.DIDIT_WORKFLOW_ID?.trim();
  if (!workflowId) {
    const suggested = workflows[0]?.id ?? "";
    workflowId = await ask("DIDIT_WORKFLOW_ID to use", suggested);
  }

  const webhookUrl =
    process.env.DIDIT_WEBHOOK_URL || (await ask("Webhook URL (your /kyc/callback)", "https://lyniago.lyniafinance.com/kyc/callback"));
  const webhookSecret = await registerWebhook(apiKey, webhookUrl);

  summary({ apiKey, workflowId, webhookSecret, callbackUrl: process.env.DIDIT_CALLBACK_URL });
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
