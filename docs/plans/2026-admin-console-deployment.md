# Admin Console Deployment Plan — "take the admin site to its URL"

**Goal:** stand up the `apps/admin` Next.js console at a stable, authenticated public URL
(`https://lyniagoadmin.lyniafinance.com`), reusing the GCP topology the API already runs on and
satisfying the console's existing fail-closed operator-auth gate.

**Status of the code today**
- `apps/admin` is a Next.js 16 App-Router app that renders server-side and calls the API with a
  shared `ADMIN_API_TOKEN` (`apps/admin/app/lib/api.ts`), reading `API_BASE_URL` + `ADMIN_API_TOKEN`
  from the environment.
- The privileged-access control is **already implemented in code**: `apps/admin/middleware.ts` +
  `app/lib/console-auth.ts` fail closed in production unless an identity-aware proxy asserts an
  operator identity (default header `x-goog-authenticated-user-email`, i.e. GCP IAP), and forward it
  downstream as `x-lynia-operator` → `X-Operator` for audit attribution.
- **Missing:** container image, CI coverage, deploy workflow, Terraform (Cloud Run service, ALB
  wiring, cert, domain), IAP, DNS. The ALB in `infra/terraform/lb.tf` today references only the
  `lynia-api` Cloud Run service.

**Recommended topology:** a second Cloud Run service `lynia-admin` (region `africa-south1`, to match
the API), exposed through the **same** global external HTTPS ALB via its own serverless NEG +
backend service + host rule (`lyniagoadmin.lyniafinance.com`), reusing the existing static IP.
**IAP is enabled on
the admin backend service** — this is the piece the API doesn't have and the piece the console's
middleware requires. Cloud Armor + Google-managed TLS as with the API.

---

## Phase 1 — Containerize the admin app (code, mergeable now)

1. **`apps/admin/next.config.js`** — add `output: "standalone"` so Next emits a self-contained
   server bundle (keeps `transpilePackages: ["@lynia/shared"]`).
2. **`apps/admin/Dockerfile`** — multi-stage, workspace-aware, mirroring `apps/api/Dockerfile`:
   - `base`: `node:22-slim`, `corepack enable`, `WORKDIR /repo`.
   - `deps`: copy `pnpm-workspace.yaml`, root `package.json`, lockfile, `patches/`, and the
     `packages/shared` + `apps/admin` manifests; `pnpm install --frozen-lockfile=false
     --config.allow-unused-patches=true` (same pruned-workspace patch caveat as the API image).
   - `build`: copy source, `pnpm --filter @lynia/shared build && pnpm --filter @lynia/admin build`.
   - `runtime`: `NODE_ENV=production`, copy `.next/standalone`, `.next/static`, and `public/`;
     `EXPOSE 3000`; `CMD ["node", "apps/admin/server.js"]` (adjust to the standalone layout).
   - `PORT` respected (Cloud Run injects `8080` by default; set `--port` in deploy or honor `$PORT`).
3. **`.dockerignore`** — confirm it doesn't exclude anything the admin build needs.
4. **Standalone-in-monorepo layout (footgun, eng-review #4):** with a pnpm workspace, `next build`
   emits `.next/standalone/apps/admin/server.js` (not a root `server.js`) and does NOT copy static
   assets — pin the runtime copy layout exactly: `.next/standalone` → `/repo`, `.next/static` →
   `/repo/apps/admin/.next/static`, `public/` → `/repo/apps/admin/public`; `CMD ["node",
   "apps/admin/server.js"]`. The deploy workflow must run a real `docker build` + container boot smoke,
   not just `next build`, or asset-404s ship silently.

## Phase 1b — Test the security boundary (code, mergeable now — do this FIRST, eng-review #2)

5. **`apps/admin/app/lib/console-auth.test.ts`** — `evaluateConsoleAccess` is the fail-closed gate
   guarding KYC-approve / ban / cash-record and today has **zero tests**. It is a pure function; test
   it before the deploy exists. Cases: public-path bypass; prod defaults to require-auth; explicit
   `ADMIN_CONSOLE_REQUIRE_AUTH` on/off override; empty/whitespace identity → 401 fail-closed; IAP
   issuer-prefix stripping (`accounts.google.com:alice@corp` → `alice@corp`); operator normalization.

## Phase 1c — Verify the IAP JWT in middleware (code, mergeable now — resolved fork, eng-review #3)

7a. Extend `console-auth.ts` / `middleware.ts` to verify `X-Goog-IAP-JWT-Assertion`: fetch and cache
    Google's IAP public keys (`https://www.gstatic.com/iap/verify/public_key-jwk`), verify the JWT
    signature, `iss` (`https://cloud.google.com/iap`), and `aud` (the IAP-protected backend's audience
    string `/projects/<num>/global/backendServices/<id>`), and derive the operator from the verified
    `email` claim — not the plaintext header. Keep the plaintext-header path only for the
    auth-disabled dev/local mode. Fail closed on any verification failure. The `aud` value comes from
    the Terraform-created backend service (Phase 3.8), so thread it in as an env var
    (`ADMIN_CONSOLE_IAP_AUDIENCE`). Add this to the Phase-1b test suite (valid/expired/wrong-aud/
    wrong-iss/bad-signature/missing-assertion). Pure functions where possible so the crypto path is
    unit-testable without a live IAP.

## Phase 2 — CI test lane for admin (code, mergeable now)

6. **Correction:** admin `typecheck`/`lint`/`build` ALREADY run in CI — root `turbo run
   typecheck|lint|build` (`ci.yml:78-80`) fans out to `@lynia/admin`, which defines all three. The
   real gap is the **test lane**: `ci.yml:81-82` runs `--filter @lynia/api test` + `--filter
   @lynia/mobile test` only, so admin is excluded. Add `pnpm --filter @lynia/admin test` (or switch
   the CI test step to root `turbo run test`) so the Phase-1b spec actually gates merges.

## Phase 3 — Terraform: Cloud Run + ALB wiring (code, founder applies)

Add to `infra/terraform/` (new file `admin.tf` + variable additions), all gated behind a
`admin_enabled` flag defaulting to `false` so the change is zero-diff until the founder arms it
(mirroring the `staging_enabled` pattern in `staging.tf`).

5. **Variables** (`variables.tf`): `admin_domain` (= `lyniagoadmin.lyniafinance.com`),
   `admin_enabled` (bool, default false), plus IAP OAuth
   client id/secret vars (or reference a manually-created OAuth brand — see Phase 5).
6. **Cloud Run service** — Terraform *references* it the same way `lb.tf` references the API service
   (service created by the deploy workflow, not Terraform, so the two don't fight over ownership).
   Alternatively manage it in Terraform via `google_cloud_run_v2_service`; pick one owner. Recommend
   matching the API: workflow owns the service, Terraform owns the edge.
7. **Serverless NEG** (`google_compute_region_network_endpoint_group`) in `africa-south1` targeting
   `lynia-admin`.
8. **Backend service** (`google_compute_backend_service`, `EXTERNAL_MANAGED`, `HTTP`) with:
   - `security_policy` = the existing Cloud Armor policy (or an admin-specific one).
   - **`iap { oauth2_client_id, oauth2_client_secret }`** — the differentiator vs. the API backend.
9. **URL map** — add a `lyniagoadmin.lyniafinance.com` host rule → admin backend (extend the existing
   `google_compute_url_map.api`, same pattern as the staging host rule already there).
10. **Managed cert** — append a `google_compute_managed_ssl_certificate` for `admin_domain` to the
    HTTPS target proxy's `ssl_certificates` list (append, don't replace — same caution the staging
    cert comment in `lb.tf` calls out, or the prod cert force-replaces and churns live TLS).
11. **Ingress** — set the admin Cloud Run service ingress to internal-and-cloud-load-balancing so the
    `*.run.app` origin isn't directly reachable (the org already disables `*.run.app` at the edge;
    this mirrors the API and the SECURITY-OPS "restrict the console's ingress" step).
11a. **admin→API path (resolved fork — REVISED 2026-07-18 to public).** The console calls the API at
    its public `https://<api_domain>`, bearing `ADMIN_API_TOKEN` + forwarding `X-Operator`. The admin
    service takes **no VPC connector**. Why the internal-VPC pick was reversed at arming time: an
    internal Cloud-Run→Cloud-Run call only arrives as "internal" under `--vpc-egress all-traffic`,
    which then routes the middleware's IAP-JWKS fetch (`gstatic.com`) through the connector and breaks
    JWT verification unless a Cloud NAT is stood up — real day-1 infra for a marginal gain. Public hop
    is TLS + admin-token + Cloud-Armor protected; internal + Cloud NAT is a post-launch hardening.

## Phase 4 — Deploy workflow (code, mergeable; runs on founder-set vars)

12. **`.github/workflows/deploy-admin.yml`** — clone the WIF/deploy pattern from `release.yml`:
    - Auth via `GCP_WORKLOAD_IDENTITY_PROVIDER` + deployer SA (already has Run Admin + AR Writer).
    - `docker build -f apps/admin/Dockerfile`, push to the existing Artifact Registry repo.
    - `gcloud run deploy lynia-admin --region africa-south1 --service-account <runtime SA>
      --ingress internal-and-cloud-load-balancing --image …:$GITHUB_SHA` with env:
      - `NODE_ENV=production`
      - `API_BASE_URL=https://<api_domain>` (resolved fork revised to public — see 11a; no VPC connector).
      - `ADMIN_CONSOLE_IAP_AUDIENCE=<backend-service audience>` (Phase 1c JWT verification).
      - `ADMIN_API_TOKEN` from **Secret Manager** (`--set-secrets`), not a plaintext env var.
      - Leave `ADMIN_CONSOLE_REQUIRE_AUTH` unset (defaults on in prod); IAP supplies the header.
    - Trigger: `push` to `main` on `apps/admin/**` + `packages/shared/**` changes, plus
      `workflow_dispatch`. Gate the whole job on `vars.GCP_ADMIN_ENABLED == 'true'` so it's dormant
      until armed (mirrors `deploy-staging.yml`).
13. **Secret** — add `ADMIN_API_TOKEN` to Secret Manager (`infra/terraform/secrets.tf`) and grant the
    runtime SA per-secret accessor (the SA already has that pattern for other secrets).

## Phase 5 — IAP + identity (founder / GCP console — see docs/plans/2026-admin-console-arming.md §1)

> REVISED at arming (2026-07-18) after verifying the live environment: the project's org has **no
> Cloud Identity directory** (only a consumer `@gmail.com`), and the **IAP OAuth Admin API was shut
> down 2026-03-19**. So the plan is a **custom OAuth client on an EXTERNAL, published consent screen**,
> created by hand in the console — *not* an Internal/Workspace client, and *not* the Google-managed
> client (which admits only in-directory users and would lock everyone out here).

14. **Google Auth Platform → Audience → External → Publish (Production).** IAP uses only basic scopes,
    so no Google verification is needed.
15. **Create a custom Web-application OAuth client** (`Lynia Admin`) with redirect URI
    `https://iap.googleapis.com/v1/oauth/clientIds/<id>:handleRedirect`; feed its id/secret to Terraform
    (Phase 3.8, `admin_iap_oauth_client_id/secret`) — Terraform's custom-client `iap` block is correct.
16. **Enable IAP** on the admin backend (Terraform, once the client id/secret are set). Terraform also
    provisions the **IAP service agent**; `deploy-admin.yml` grants it `roles/run.invoker` on the admin
    Cloud Run service (which runs `--no-allow-unauthenticated`).
17. Grant operators **`roles/iap.httpsResourceAccessor`** (`admin_iap_members` — the ONLY authz
    boundary, so keep it tight; never `allUsers`). No Workspace → enforce **MFA** as per-account
    2-Step Verification on each operator's Google account.
18. Result: IAP authenticates the operator and sets `X-Goog-IAP-JWT-Assertion`; the middleware
    cryptographically verifies it (Phase 1c) and derives the operator from the verified `email` claim.

## Phase 6 — DNS + cutover (founder)

19. Create a DNS **A record** `lyniagoadmin.lyniafinance.com` → the ALB static IP (`terraform output
    load_balancer_ip` — the SAME IP the API uses; this is a second A record, like staging).
20. Wait for the Google-managed cert for `admin_domain` to go **ACTIVE** (can take ~30 min; the first
    smoke may fail while the cert/DNS propagate — re-run, same caveat as `deploy-staging.yml`).
21. If the admin console ever does browser-side signed-URL uploads, set `bucket_cors_origins =
    ["https://lyniagoadmin.lyniafinance.com"]` (default is deny-all `[]`; never `["*"]`).

## Phase 7 — Verify (SECURITY-OPS.md acceptance)

22. **Unauthenticated** request to `https://lyniagoadmin.lyniafinance.com` is rejected by IAP *before any page
    renders* (and, behind it, the middleware would 401 anyway — belt and suspenders).
23. **Authenticated** operator loads the console, sees live data, and a mutating action
    (e.g. a KYC decision) is attributed to that human in the API **audit log** via `X-Operator`.
24. Plain-HTTP `http://lyniagoadmin.lyniafinance.com` 301-redirects to HTTPS (existing `:80` redirect rule covers
    the shared IP).
25. **Show the signed-in operator in the console UI** (design-review D-2) — the middleware already
    forwards `x-lynia-operator`; surface "signed in as <operator>" so the human sees whose name lands
    on every audit row. Small add, high trust value for an attributed admin tool.

## Rollback (ops, eng-review #5)

- **Service rollback (bad image):** `gcloud run services update-traffic lynia-admin --region
  africa-south1 --to-revisions <PREV>=100`. Cloud Run keeps prior revisions. Consider deploying with
  `--no-traffic` + a tag, smoke the tagged URL, then promote — so a broken revision never takes live
  operator traffic. (The API's `rollback.yml`/canary/autoheal are deliberately NOT cloned here: an
  internal console doesn't warrant that machinery, but "no rollback" should not be silent.)
- **Config rollback:** the whole tier is flag-gated (`admin_enabled` / `GCP_ADMIN_ENABLED`) — flip
  the flag to take the console dark without touching the API.

---

## What I can do vs. what needs the founder

**Mergeable in-repo now (I can implement):** Phases 1, 2, 4, and the Terraform *code* in Phase 3 —
all dormant/zero-diff behind `admin_enabled` / `GCP_ADMIN_ENABLED` flags, exactly like the existing
staging tier. Nothing goes live until armed.

**Founder / platform actions (I cannot do — GCP console + DNS + `terraform apply`):** create the IAP
OAuth client + consent screen, grant operator IAM + MFA, set the repo variables/secrets, run
`terraform apply`, and add the DNS A record (Phases 5, 6, and the *apply* of Phase 3).

## Open decisions

- **Domain:** `lyniagoadmin.lyniafinance.com` (confirmed by the founder, 2026-07-18).
- **Shared ALB vs. dedicated LB:** recommend the shared ALB + host rule (cheaper, consistent, reuses
  the IP/cert plumbing). IAP is per-backend-service, so the admin backend is separate regardless.
- **API reachability from admin:** public `api_domain` (simplest; token-authed) vs. internal VPC URL
  (tighter). Recommend public to start, matching how the token flow is already designed.
- **Service ownership:** deploy workflow owns the Cloud Run service; Terraform owns the edge
  (NEG/backend/cert/URL-map/IAP) — mirrors the API split and avoids ownership fights.
- **[RESOLVED 2026-07-18 — eng-review #3] Verify the signed IAP JWT.** The middleware will verify
  `X-Goog-IAP-JWT-Assertion` (signature + audience against Google's cached public keys) in addition to
  reading the email — identity stays unforgeable even if ingress is ever misconfigured or the service
  is hit directly. No UX cost (operators never see this path); pure operator-trust gain. See Phase 1c.
- **[RESOLVED 2026-07-18; REVISED at arming] admin→API path: public `api_domain`.** Initially picked
  internal-VPC, reversed at arming because the internal path breaks the middleware's IAP-JWKS fetch
  without a Cloud NAT (see Phase 3.11a). Public hop is token- + TLS- + Armor-protected; internal+NAT is
  a post-launch hardening.

---

## GSTACK REVIEW REPORT

| Run | Reviewer | Status | Findings |
|-----|----------|--------|----------|
| 1 | plan-eng-review (claude) | COMPLETE | 7 (1 correction, 1 top test gap, 1 security fork, 1 build footgun, 1 ops gap, 1 coupling-note, 1 minor) |
| 1 | plan-design-review (claude) | COMPLETE | 2 (D-1 styled 401 [accept], D-2 show signed-in operator [do]) |

**Absorbed into the plan:** Phase-1b security-boundary tests (was untested); Phase-2 rewritten (admin
build/typecheck/lint already in CI via turbo — real gap is the test lane); standalone-in-monorepo copy
layout pinned; service-rollback section added; show-signed-in-operator step added.

**VERDICT: APPROVE WITH CHANGES.** Scope is right-sized and reuses proven topology (boring by default,
no innovation token spent). Both forks resolved by the founder (2026-07-18): verify the IAP JWT
(Phase 1c) and — revised at arming — reach the API over the public `api_domain` (Phase 3.11a / 4), the
internal-VPC path being deferred to a post-launch Cloud-NAT hardening. Remaining pre-implementation
gate: the Phase-1b/1c tests exist and gate CI before the deploy is armed. Everything else absorbed.

NO UNRESOLVED DECISIONS
