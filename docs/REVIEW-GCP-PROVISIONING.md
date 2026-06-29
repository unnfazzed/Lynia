# Review — GCP provisioning IaC (engineering / cloud)

> Engineering + cloud-architecture review of the Terraform that provisions Track F
> (`infra/terraform/`), against `CONCEPT.md` §10, `ENG-REVIEW.md` (ET8/ET9 D7 seam),
> and the deploy contract in `.github/workflows/release.yml`.
> Branch: `claude/project-next-steps-y3ce3g`. Date: 2026-06-29.
>
> **Method note (honest):** the gstack `/plan-eng-review` skill could not be run in
> this session — the container's egress policy blocks cloning `garrytan/gstack`
> (GitHub access is scoped to `unnfazzed/lynia`), and `terraform`/`tofu` are not
> installed, so `terraform validate` was not executed here. This is a structured
> staff-engineer review applying the same gates; **run `terraform validate` +
> `terraform plan` locally, and a gstack `/review` over the diff, before apply.**

## Scope

Greenfield IaC: VPC + private services access + Serverless VPC connector, Cloud SQL
(Postgres 16/PostGIS), Memorystore Redis, Cloud Storage, Artifact Registry, Secret
Manager, and runtime/deployer service accounts. Plus the matching `release.yml` edits.

## Verdict: **LAND WITH FIXES** (fixes applied in this same change)

The review surfaced three P1 correctness gaps between a naive provisioning runbook and
a Cloud Run service that actually boots. All three are fixed in this change, not deferred.

### Confirmed correct
- **D7 portability preserved (ET9).** Secrets are injected as env via `--set-secrets`
  (no managed-identity), DB auth is a plain connection string, and storage abstracts URL
  generation — the Azure adapter remains a drop-in. The IaC adds no GCP-only lock-in
  beyond the deliberately-chosen managed services.
- **PostGIS path.** No Postgres provider / manual `CREATE EXTENSION` — migration
  `0001_init` runs `CREATE EXTENSION IF NOT EXISTS postgis`, and the app user has
  `cloudsqlsuperuser`, so it succeeds on first `migrate deploy`. Verified against the
  migration source.
- **Least privilege on the runtime SA.** Bucket Object Admin is bucket-scoped (not
  project storage); secret access is per-secret (not project-wide); Cloud SQL Client only.

### Findings

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Cloud Run could not reach Redis.** Memorystore is private-only and serverless Cloud Run has no VPC route by default. The original `release.yml` set no VPC connector, so every BullMQ job / Socket.IO broadcast / OTP-counter op would fail at runtime — an outage that only shows up post-deploy. | ✅ **Fixed** — added `google_vpc_access_connector.lynia-connector`; `release.yml` now passes `--vpc-connector` + `--vpc-egress private-ranges-only`, wired to a new `VPC_CONNECTOR` repo variable (emitted as a TF output). |
| **P1** | **Service ran as the default compute SA.** `gcloud run deploy` set no `--service-account`, so the service would run as the over-privileged default compute SA instead of a scoped identity — and the keyless V4 signing grant would be on the wrong principal. | ✅ **Fixed** — dedicated `lynia-run` runtime SA; `release.yml` passes `--service-account`, wired to a new `CLOUD_RUN_SERVICE_ACCOUNT` repo variable. Deployer gets `actAs` on it. |
| **P1** | **Keyless V4 signed URLs need self-`signBlob`.** `gcs.storage.ts` signs via ADC (no exported key); that requires the runtime SA to hold `serviceAccountTokenCreator` **on itself**, or every signed-URL mint 500s. | ✅ **Fixed** — `google_service_account_iam_member.runtime_sign_self`. Also set `GCP_STORAGE_PROJECT_ID` in the deploy env (the adapter reads it). |
| **P2** | **Cloud SQL public IP is enabled.** Needed so the GitHub-hosted runner's Auth Proxy can run migrations (a private-only instance is unreachable from the runner). Public IP widens surface. | ◐ **Accepted with guardrails + follow-up** — `ssl_mode = ENCRYPTED_ONLY`, **no** `authorized_networks` (only the IAM-authed Auth Proxy connects), private IP also provisioned. Follow-up logged: move migrations to a VPC-internal runner / Cloud Run Job, then set `ipv4_enabled = false`. |
| **P2** | **Deployer SA JSON key lives in TF state.** `google_service_account_key` exposes a long-lived credential. | ✅ **Resolved — keyless WIF.** The org enforces `constraints/iam.disableServiceAccountKeyCreation`, so the key path is dropped entirely: `wif.tf` provisions a Workload Identity pool/provider scoped to `assertion.repository == "unnfazzed/Lynia"`, and `release.yml` authenticates via `workload_identity_provider` + `service_account`. `emit_deployer_sa_key` now defaults false. No long-lived secret exists. |
| **NIT** | Bucket CORS defaults to `origin = ["*"]`. | **Deferred** — fine for the pilot (signed URLs are the actual gate; CORS only affects browser uploaders). `bucket_cors_origins` is a variable; tighten to the admin origin before launch. Logged. |
| **NIT** | Private-services peering range could overlap the connector `/28`. | ✅ **Fixed** — peering range pinned to `10.10.0.0/16`, connector on `10.8.0.0/28`; provably disjoint. |

## Cost (pilot, rough, africa-south1)

`db-custom-1-3840` Cloud SQL (~$50/mo) + Memorystore BASIC 1 GB (~$35/mo) + VPC
connector min-2 instances (~$10/mo) dominate; Cloud Run / Storage / AR are
usage-priced and ~$0 at pilot traffic. **~$95–110/mo** before Google for Startups
credits, which should cover it. Downsize `db_tier` to `db-g1-small` to stretch further.

## Residual risks / explicitly out of scope
- **Live `terraform validate` + `plan` not run here** (no binary, restricted egress). Run locally first.
- **First `gcloud run deploy` creates the service** — the IaC creates its dependencies
  (SA, connector, secrets, SQL) but not the service. Order: `terraform apply` → arm → push.
- **No HA** (Redis BASIC, Cloud SQL ZONAL) — intentional for pilot; logged as a pre-launch follow-up.

## Verdict line
**LAND WITH FIXES applied.** The three P1s that would have produced a green CI deploy
of a non-functional service (no Redis, wrong identity, broken signed URLs) are closed in
this change. Remaining items are hardening follow-ups with explicit triggers, consistent
with how prior stages booked deferred work.

---

## Post-apply addendum (2026-06-29, branch `claude/gcp-provisioning-review-kni16v`)

Re-review now that the project is provisioned (`lynia-500911`) and the external HTTPS
load balancer (PR #44) has landed. Same constraints as the original pass — gstack
`/plan-eng-review` still can't run here (egress scoped to `unnfazzed/lynia`; the
`check-gstack.sh` hook blocks skill use until gstack is installed locally), and there's
no `terraform`/`tofu` binary, so this is again a structured staff-engineer pass over the
actual `.tf` + `release.yml`. **Run `terraform validate`/`plan` and a gstack `/review`
locally before the next apply.**

### Prior fixes — verified present in the committed code
Re-checked each against source, not just the changelog:
- VPC connector + `--vpc-connector` + `--vpc-egress private-ranges-only` — `network.tf`,
  `release.yml:130-131`. ✓ (private-ranges-only is also correct: Secret Manager + the
  `signBlob` IAM Credentials call are public endpoints and egress direct.)
- Dedicated runtime SA + `--service-account` — `iam.tf`, `release.yml:128`. ✓
- Self-`signBlob` grant for keyless V4 URLs — `google_service_account_iam_member.runtime_sign_self`. ✓
- Keyless WIF, no SA key — `wif.tf`, `release.yml:81-86`, `emit_deployer_sa_key` defaults false. ✓
- Disjoint ranges — PSA `10.10.0.0/16`, connector `10.8.0.0/28`. ✓
- Port — `env.PORT` defaults `3000` = `--port 3000` (Cloud Run injects `PORT`). ✓

### New findings

| Sev | Finding | Recommendation |
|-----|---------|----------------|
| **P1 (verify before first `/ship`)** | **`--allow-unauthenticated` + no `--ingress` may collide with this org's policies.** The org demonstrably runs hardened (`iam.disableServiceAccountKeyCreation`; default `*.run.app` URL disabled at the edge — see `lb.tf`). Such orgs almost always also enforce **`constraints/iam.allowedPolicyMemberDomains`** (domain-restricted sharing — blocks the `allUsers` binding `--allow-unauthenticated` adds → deploy step fails) and/or **`constraints/run.allowedIngress = internal-and-cloud-load-balancing`** (the deploy sets no `--ingress`, so a new service defaults to `all` and is rejected). Either reds the **first** deploy *after* a green build/migrate — the exact "green CI, dead service" class the original review targeted. | Add `--ingress internal-and-cloud-load-balancing` to the `gcloud run deploy` (it's fronted by the ALB anyway, so this is strictly correct, not a workaround). If `allUsers` is blocked, drop `--allow-unauthenticated` and grant invoker via an org-allowed principal (or an org-policy exception/tag for the service). Confirm both policies in the project first: `gcloud resource-manager org-policies list --project lynia-500911`. |
| **P2 (fixed here)** | **`infra/terraform/README.md` arming section was stale** — it instructed setting a `GCP_SA_KEY` secret and listed WIF as a *deferred* follow-up, but WIF is implemented and is the **only** auth path (the org blocks keys). A founder following the README would hunt for a key that can't exist. | ✅ **Fixed in this change** — README now documents keyless WIF (matches `outputs.tf` `arming_guide`), drops the `GCP_SA_KEY` step, and lists the WIF pool + ALB in the resource table. |
| **P2 (operational)** | **Managed TLS cert is a two-step rollout.** `lynia-api-cert` only goes ACTIVE once the forwarding rule is live **and** a DNS A record for `lyniago.lyniafinance.com` points at `load_balancer_ip`. Until DNS resolves + Google provisions (can take ~15–60 min), `https://api_domain` serves a cert error — easy to misread as a deploy failure. | Runbook step: after the first deploy, `terraform output load_balancer_ip` → create the A record → poll `gcloud compute ssl-certificates describe lynia-api-cert --global` until `ACTIVE`. |
| **NIT** | Migration step uses `pnpm install --frozen-lockfile=false` (`release.yml:114`) — a transitive bump could surprise a prod migration run. Matches the Dockerfile's choice, so consistent. | Leave for the pilot; pin (`--frozen-lockfile`) once the lockfile is treated as the deploy contract. |
| **NIT** | Bucket CORS still `["*"]` (carried from the original review). | Tighten `bucket_cors_origins` to the admin origin before launch. Still logged. |

### Addendum verdict
**Provisioning is sound and the prior P1s are genuinely closed in code.** The one thing
that can still red the *first* real deploy is the org-policy interaction on ingress/`allUsers`
— verify those two policies and add `--ingress internal-and-cloud-load-balancing` before
arming. Everything else is a doc fix (done) or a logged pre-launch hardening item.
