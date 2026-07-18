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

## Phase 2 — CI coverage (code, mergeable now)

4. Add admin to `.github/workflows/ci.yml`: `pnpm --filter @lynia/admin typecheck`, `lint`, and a
   `next build` smoke (the app has `typecheck`/`lint`/`build` scripts already). Without this the
   console silently rots — it is currently absent from CI.

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

## Phase 4 — Deploy workflow (code, mergeable; runs on founder-set vars)

12. **`.github/workflows/deploy-admin.yml`** — clone the WIF/deploy pattern from `release.yml`:
    - Auth via `GCP_WORKLOAD_IDENTITY_PROVIDER` + deployer SA (already has Run Admin + AR Writer).
    - `docker build -f apps/admin/Dockerfile`, push to the existing Artifact Registry repo.
    - `gcloud run deploy lynia-admin --region africa-south1 --service-account <runtime SA>
      --ingress internal-and-cloud-load-balancing --image …:$GITHUB_SHA` with env:
      - `NODE_ENV=production`
      - `API_BASE_URL=https://<api_domain>` (public API; admin already bears `ADMIN_API_TOKEN`) — or
        the internal API URL if kept in-VPC.
      - `ADMIN_API_TOKEN` from **Secret Manager** (`--set-secrets`), not a plaintext env var.
      - Leave `ADMIN_CONSOLE_REQUIRE_AUTH` unset (defaults on in prod); IAP supplies the header.
    - Trigger: `push` to `main` on `apps/admin/**` + `packages/shared/**` changes, plus
      `workflow_dispatch`. Gate the whole job on `vars.GCP_ADMIN_ENABLED == 'true'` so it's dormant
      until armed (mirrors `deploy-staging.yml`).
13. **Secret** — add `ADMIN_API_TOKEN` to Secret Manager (`infra/terraform/secrets.tf`) and grant the
    runtime SA per-secret accessor (the SA already has that pattern for other secrets).

## Phase 5 — IAP + identity (founder / GCP console — SECURITY-OPS.md §A, Option 1)

14. Configure the **OAuth consent screen** (Internal / restricted to the Google Workspace domain).
15. Create the **IAP OAuth client**; feed its id/secret to Terraform (Phase 3.8) as sensitive vars.
16. **Enable IAP** on the admin backend service (done by Terraform once the client exists).
17. Grant operators **`roles/iap.httpsResourceAccessor`**; enforce **MFA** at the Workspace level.
18. Result: IAP sets `X-Goog-Authenticated-User-Email` → the console's default proxy header, no app
    change needed. (Option 2, a self-hosted oauth2-proxy setting `ADMIN_CONSOLE_PROXY_HEADER`, is the
    non-GCP fallback.)

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
