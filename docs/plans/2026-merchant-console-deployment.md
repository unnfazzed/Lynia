# Merchant Dashboard Deployment Plan — "take apps/merchant to its URL"

> **Post-deploy addendum (2026-08-18, discovered live at first sign-in):** the dashboard deployed and
> served its `/login` page correctly, but OTP sign-in failed with a generic "Couldn't reach the
> server" error. Root cause: `apps/api`'s CORS policy (`apps/api/src/common/cors.ts`) default-denies
> every cross-origin *browser* request, and the merchant dashboard is the first client that is one —
> `apps/admin` proxies API calls server-side (no browser `Origin` header, nothing to allow-list) and
> `apps/mobile` is native (CORS is a browser-only protection). A blocked CORS response and a genuine
> network failure look identical to `fetch()`, so this surfaced as a networking symptom, not an
> access-control one. Fixed by wiring `CORS_ALLOWED_ORIGINS` (already read by `main.ts` +
> `tracking.gateway.ts`, previously never populated by any deploy workflow) into `release.yml`, gated
> behind a repo Variable exactly like `REFRESH_TTL_SECONDS`. **Requires setting the repo Variable
> `CORS_ALLOWED_ORIGINS = https://lyniagomerchant.lyniafinance.com` and a fresh API deploy** (rides
> the existing canary pipeline — `release.yml` fires on every push to `main`) before merchant sign-in
> works end to end. Folded into the founder checklist below as step 5.

**Goal:** stand up the `apps/merchant` Next.js dashboard at a stable public URL
(`https://lyniagomerchant.lyniafinance.com`), reusing the GCP/ALB topology the API and admin console
already run on. Parent plan: `docs/plans/2026-07-26-merchant-verticals-plan.md` §2.3 ("own Cloud Run
service + deploy workflow; cannot take down the API") and §5 ("dark launch continuously... launch day
is a config flip, not a deploy"). This doc is the deploy-wiring piece that plan deferred to P3.

**Status of the code today (2026-08-18):** `apps/merchant` is not a stub — the dashboard is fully
built: login (`/login`), live order queue with WebSocket presence + audio alarm + wake lock
(`/queue`), menu/category editor, hours editor, shop toggle, weekly statement, and a fail-closed
access gate (`middleware.ts` + `app/lib/merchant-access.ts`). `next.config.js` already sets `output:
"standalone"` for this deploy. What was missing — container image, deploy workflow, Terraform edge,
DNS — is what this PR adds, gated dormant until armed, mirroring exactly how the admin console
(`docs/plans/2026-admin-console-deployment.md`) and staging tier were built and armed.

## Architecture decision: public app, no IAP (unlike admin)

The admin console is an **internal operator tool**: it holds a shared, privileged `ADMIN_API_TOKEN`
server-side, so IAP (Workspace/Google-account SSO in front of the LB) is the auth boundary, and the
console's middleware additionally verifies the IAP JWT.

The merchant dashboard is the opposite shape — a **public, client-driven app for external users**:

- A merchant signs in with their own phone + OTP against `apps/api`'s existing rider/customer auth
  (`apps/merchant/app/lib/api-client.ts` → `/auth/otp/request` + `/auth/otp/verify`), exactly like the
  mobile app. The resulting bearer token is stored in a plain (non-`httpOnly`) cookie
  (`app/lib/session.ts`) because the tab itself — the alarm loop, wake lock, reconnect banner, and the
  live queue WebSocket (`app/lib/queue-socket.ts`, connecting the **browser directly to the API**, not
  through this Next server) — needs to read it.
- This server therefore holds **no privileged secret**: `NEXT_PUBLIC_API_BASE_URL` is a public,
  build-time-inlined value, not a credential. There is nothing here for IAP to protect that the API's
  own `JwtAuthGuard` → `MerchantGuard` doesn't already gate.
- The auth boundary is `middleware.ts` + `evaluateMerchantAccess`: an unauthenticated request to any
  non-public path **redirects to `/login`** (fail-closed UX), while the real authorization stays
  server-side on every `apps/api` merchant route — identical split to how the API itself is public but
  gates every mutation behind a verified JWT.

**Consequence:** the merchant Cloud Run service is `--allow-unauthenticated` (like the API), not
`--no-allow-unauthenticated` + IAP (like admin). Cloud Armor + Google-managed TLS at the edge is the
perimeter; no OAuth client, no consent screen, no operator allowlist, no Secret Manager container.
This makes merchant's arming meaningfully shorter than admin's.

**Deploying this tier is not launching the vertical.** `RESTAURANTS_ENABLED` /
`MERCHANT_DISPATCH_AUTO_ENABLED` / `MERCHANT_WALLET_ENABLED` are `apps/api` kill switches that stay
OFF in production independently of this deploy (`deploy-staging.yml`, `release.yml`). Standing up
`lyniagomerchant.lyniafinance.com` makes the dashboard *reachable* — a merchant who signs in still
hits `503`s on every restaurants-gated route until those flags flip and their account is onboarded.
That flip is a separate, already-existing decision, not part of this PR.

## What's implemented in this PR (mergeable now, zero-diff until armed)

1. **`apps/merchant/Dockerfile` + `Dockerfile.dockerignore`** — multi-stage, workspace-aware, mirrors
   `apps/admin/Dockerfile`. One real difference: `NEXT_PUBLIC_API_BASE_URL` is a Docker **build arg**,
   not a runtime env var — Next.js inlines `NEXT_PUBLIC_*` values into the browser bundle at `next
   build` time (`app/lib/config.ts` deliberately throws at build time if it's unset in production), so
   it has to be supplied via `--build-arg` in the workflow, not `gcloud run deploy --set-env-vars`.
2. **`.github/workflows/deploy-merchant.yml`** — same shape as `deploy-admin.yml` (validate config →
   auth via the existing keyless WIF deployer → build+load → boot smoke → push → no-traffic deploy →
   promote), gated on `vars.GCP_MERCHANT_ENABLED == 'true'`. The boot smoke checks three things a bare
   `next build` can't: the server serves, the standalone `.next/static` + `public/` copy layout didn't
   drop an asset (the exact footgun the admin plan flagged — `docs/plans/2026-admin-console-
   deployment.md` Phase 1 item 4), and the fail-closed gate actually redirects an unauthenticated `/`
   to `/login` (this app's analogue of admin's "gated route returns 401" check).
3. **`infra/terraform/merchant.tf`** — a serverless NEG + public backend service (Cloud Armor, no IAP)
   + a dedicated least-privilege runtime SA (`lynia-run-merchant`, no roles at all — this service calls
   no GCP API) + its own managed TLS cert. All resources `count = var.merchant_enabled ? 1 : 0`.
4. **`infra/terraform/lb.tf`**, **`variables.tf`**, **`dns.tf`**, **`outputs.tf`** — the same
   `dynamic host_rule`/`path_matcher`/cert-concat wiring the admin tier used to ride the *existing*
   shared ALB/IP under its own hostname, plus an optional Cloudflare A record
   (`cloudflare_dns_record.merchant`, only created when both `cloudflare_dns_enabled` and
   `merchant_enabled` are true).
5. **Root `.dockerignore`** — added `apps/merchant` to the exclude list (mirrors the existing
   `apps/admin` line) so the API image's build context doesn't grow every time the dashboard changes.

No changes to `apps/merchant/app/**` — the dashboard code was already built and is already covered by
CI (`ci.yml` already runs `@lynia/merchant`'s typecheck/lint/build/test via `turbo run` + an explicit
`pnpm --filter @lynia/merchant test`, unlike admin which needed that gap closed).

## What needs the founder (GCP project access + `terraform apply` + DNS — cannot be done from a coding
## agent session with no cloud credentials)

1. **`terraform apply`** with `merchant_enabled = true` (and, if you want Terraform-managed DNS,
   `cloudflare_dns_enabled = true` — already on if the admin tier turned it on). Read the outputs:
   `MERCHANT_CLOUD_RUN_SERVICE`, `MERCHANT_CLOUD_RUN_SERVICE_ACCOUNT`, `merchant_endpoint`.
2. **Set repo Variables** (Settings → Secrets and variables → Actions → Variables):
   ```
   GCP_MERCHANT_ENABLED               = true
   MERCHANT_CLOUD_RUN_SERVICE          = lynia-merchant                 (terraform output, or default)
   MERCHANT_CLOUD_RUN_SERVICE_ACCOUNT  = <terraform output MERCHANT_CLOUD_RUN_SERVICE_ACCOUNT>
   MERCHANT_API_BASE_URL               = https://<api_domain>            (e.g. https://lyniago.lyniafinance.com)
   ```
   `GCP_PROJECT_ID` / `GCP_REGION` / `GCP_ARTIFACT_REPO` / `GCP_WORKLOAD_IDENTITY_PROVIDER` /
   `GCP_SERVICE_ACCOUNT` already exist (shared with `release.yml` / `deploy-admin.yml`) — nothing new
   to add there.
3. **DNS** — if `cloudflare_dns_enabled` is on, Terraform already created the A record in step 1; skip
   to step 4. Otherwise, by hand: `merchant_domain` (default `lyniagomerchant.lyniafinance.com`) → the
   **same** `load_balancer_ip` output the API and admin domains already point at (one shared anycast
   IP, a second/third/fourth A record — no new IP).
4. **Trigger the first deploy** — `workflow_dispatch` on `deploy-merchant.yml`, or push a no-op change
   under `apps/merchant/**`. Wait for the managed cert to go `ACTIVE` (can take up to ~30 min after DNS
   resolves; the first run's boot smoke tests the *container*, not the public URL, so it isn't blocked
   on the cert — but the public URL itself won't answer until the cert is active).
5. **Allow the merchant origin through the API's CORS policy** — discovered live, see the addendum at
   the top of this doc. Set the repo Variable `CORS_ALLOWED_ORIGINS =
   https://lyniagomerchant.lyniafinance.com` (Settings → Secrets and variables → Actions → Variables
   on the API's repo config, same place as step 2). This alone does nothing until a fresh API deploy
   picks it up — `release.yml` fires automatically on the next push to `main` that isn't docs-only,
   riding its existing staging-gate → canary 10→50→100 → auto-rollback pipeline. If you need it live
   sooner than the next merge, `workflow_dispatch` on `release.yml` directly. Without this step, the
   dashboard loads but OTP sign-in and the live-queue WebSocket both fail with a generic "Couldn't
   reach the server" — the browser blocks the response before the app ever sees it, so this looks
   like a network problem rather than a CORS one.
6. **Verify:**
   - `curl -I https://lyniagomerchant.lyniafinance.com/` → `307`/`308` to `/login` (unauthenticated,
     fail-closed).
   - `curl https://lyniagomerchant.lyniafinance.com/api/healthz` → `{"status":"ok","app":"merchant"}`.
   - Plain HTTP redirects to HTTPS (existing `:80` redirect rule covers every hostname on the shared
     IP — no per-tier work needed).
   - Sign in with a real merchant OTP account end-to-end (step 5 must be live first).

## Rollback

- **Service rollback (bad image):** `gcloud run services update-traffic lynia-merchant --region
  <region> --to-revisions <PREV>=100`. Cloud Run keeps prior revisions; deploy-merchant.yml already
  ships with `--no-traffic` + tag + promote, so a broken revision never takes live traffic in the
  first place.
- **Config rollback:** the whole tier is flag-gated (`merchant_enabled` / `GCP_MERCHANT_ENABLED`) —
  flip either flag to take the dashboard dark without touching the API.
- This tier deliberately does **not** get `release.yml`'s canary/autoheal machinery (same call as
  admin): it has no DB, no state, and a bad revision fails the no-traffic boot check before it ever
  serves a byte.

## Open decisions for the founder

- **Domain:** proposing `lyniagomerchant.lyniafinance.com` (consistent with `lyniago.lyniafinance.com`
  / `lyniagoadmin.lyniafinance.com`). Override via `merchant_domain` in `terraform.tfvars` before the
  first apply if you'd rather use something else (e.g. `vendor.lyniafinance.com`) — changing it later
  force-replaces the managed cert.
- **`MERCHANT_API_BASE_URL`:** recommend the same public `api_domain` the admin console and mobile app
  already use. Because it's baked in at *build* time, changing it later means a rebuild+redeploy of
  the merchant image, not just a Cloud Run env var flip — worth getting right at first arm.
