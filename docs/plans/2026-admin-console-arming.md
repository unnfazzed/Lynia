# Admin Console Arming Runbook — taking `lyniagoadmin.lyniafinance.com` live

The code, container, CI, deploy workflow, and Terraform for the admin console are merged and **dormant**
(PRs #301 → #303; plan: `docs/plans/2026-admin-console-deployment.md`). This runbook is the ordered
founder/platform steps to actually turn it on. Nothing here is code — it's GCP console, Secret Manager,
repo settings, `terraform apply`, and DNS. Each step lists its verify.

> Everything is gated behind `admin_enabled` (Terraform) + `GCP_ADMIN_ENABLED` (CI). Until step 6 the
> console does not exist and no traffic reaches it.

Prereqs: the API tier is already provisioned (shared ALB, VPC connector, Artifact Registry, WIF deployer
SA all exist — this rides on them).

---

## 1. Create the IAP OAuth client (GCP console)

IAP is the human-auth boundary. Terraform does not create the OAuth brand/client (one brand per project,
and it often must be made by hand for internal orgs), so make it first.

1. **APIs & Services → OAuth consent screen:** user type **Internal** (restricts to your Workspace
   domain). Fill app name + support email. Save.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID:** type **Web application**,
   name it `lynia-admin-iap`. Create.
3. Copy the **client id** and **client secret** — they feed step 2.

*Verify:* the client shows under Credentials as a Web application.

## 2. `terraform apply` the admin tier

Put the IAP client + operators in a VCS-ignored tfvars (never commit the secret):

```hcl
# infra/terraform/admin.auto.tfvars  (gitignored)
admin_enabled                 = true
admin_iap_oauth_client_id     = "XXXX.apps.googleusercontent.com"
admin_iap_oauth_client_secret = "GOCSPX-..."
admin_iap_members             = ["group:ops@lyniafinance.com"]   # or user:alice@lyniafinance.com
# admin_domain defaults to lyniagoadmin.lyniafinance.com
```

```bash
cd infra/terraform
terraform plan    # expect: admin NEG + backend(+IAP) + cert + runtime SA + ADMIN_API_TOKEN secret,
                  # and the admin host rule + cert appended to the shared ALB. NO changes to the API/prod.
terraform apply
```

*Verify:* apply succeeds; `terraform output ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` and
`terraform output ADMIN_CONSOLE_IAP_AUDIENCE` return values.

## 3. Populate the `ADMIN_API_TOKEN` secret

Terraform created the **empty** secret container. The value is an admin JWT the API accepts —
`AdminGuard` requires `role: "admin"` and `JwtAuthGuard` verifies an HS256 signature over
`JWT_SIGNING_SECRET`.

> **Do NOT use a normal login token.** `TokenService.signAccess` stamps `expiresIn: ACCESS_TTL_SECONDS`
> (default **900s / 15 min**), so a login token would 401 the console 15 minutes after you arm it. The
> console needs a **long-lived** directly-signed token.

Mint one (this must run where `JWT_SIGNING_SECRET` is available — read it from Secret Manager; the token
never has to leave your shell):

```bash
SECRET="$(gcloud secrets versions access latest --secret=JWT_SIGNING_SECRET)"
TOKEN="$(node -e '
  const jwt=require("jsonwebtoken");
  // role:"admin" is what AdminGuard checks; sub is the audit fallback when no X-Operator (IAP sets one).
  process.stdout.write(jwt.sign({role:"admin"}, process.env.SECRET,
    {subject:"admin-console", algorithm:"HS256", expiresIn:"365d"}));
' )"
printf '%s' "$TOKEN" | gcloud secrets versions add ADMIN_API_TOKEN --data-file=-
```

*Verify:* `gcloud secrets versions list ADMIN_API_TOKEN` shows one enabled version. **Rotation:** re-mint
and add a new version, then re-run the deploy (also the compromise response in `docs/IR-RUNBOOK.md`).
Because it's long-lived, IAP in front + the 365-day expiry are the containment — rotate on any operator
offboarding or suspected leak.

## 4. Set the repo Variables (Settings → Secrets and variables → Actions → Variables)

Most are shared with the API and already set. Add the admin-specific ones from the Terraform outputs:

| Repo Variable | Value / source |
|---|---|
| `GCP_ADMIN_ENABLED` | `true` (this is the CI arming switch — set it LAST, step 6) |
| `ADMIN_CLOUD_RUN_SERVICE` | `lynia-admin` (default) |
| `ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` | `terraform output -raw ADMIN_CLOUD_RUN_SERVICE_ACCOUNT` |
| `ADMIN_CONSOLE_IAP_AUDIENCE` | `terraform output -raw ADMIN_CONSOLE_IAP_AUDIENCE` |
| `ADMIN_API_BASE_URL` | `https://<api_domain>` (the public API endpoint — see note) |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ARTIFACT_REPO`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` | already set for the API deploy |

> **`ADMIN_API_BASE_URL` (public, launch-ready).** The console calls the API at its public
> `https://<api_domain>` and bears `ADMIN_API_TOKEN` (+ forwards `X-Operator`). An internal
> Cloud-Run→Cloud-Run path was considered but reversed: it would need `--vpc-egress all-traffic` to
> arrive as "internal", which then routes the middleware's IAP-JWKS fetch (`gstatic.com`) through the
> connector and breaks JWT verification unless a Cloud NAT is added — real day-1 infra for a marginal
> gain. The public hop is TLS + admin-token + Cloud-Armor protected. Tightening to internal + Cloud NAT
> is a clean post-launch hardening. The admin service therefore takes **no VPC connector**.

## 5. Grant operators + enforce MFA

`admin_iap_members` (step 2) already granted `roles/iap.httpsResourceAccessor`. Enforce **MFA** for those
identities at the **Google Workspace admin** level (2-step verification). Add/remove operators later by
editing `admin_iap_members` and re-applying.

*Verify:* the IAP page for the `lynia-admin-backend` backend service lists your operator principals.

## 6. Arm CI + DNS, then cut over

1. Set `GCP_ADMIN_ENABLED=true`. The next push touching `apps/admin/**` (or a manual
   **Actions → Deploy Admin Console → Run workflow**) builds, boot-smokes, and deploys `lynia-admin`.
2. Create the DNS **A record** `lyniagoadmin.lyniafinance.com` → `terraform output -raw load_balancer_ip`
   (the SAME IP as the API — a second A record).
3. Wait for the managed cert to go **ACTIVE** (up to ~30 min). The first request while DNS/cert propagate
   may fail — retry.

## 7. Verify end to end

- **Unauthenticated** hit to `https://lyniagoadmin.lyniafinance.com` is bounced to Google sign-in by IAP;
  after a non-operator signs in, IAP returns 403 (not on the access list).
- **Operator** signs in → the console loads with live data.
- A **mutating action** (e.g. a KYC decision) is attributed to that operator in the API **audit log**
  (`X-Operator`), and the console header shows "signed in as <operator>".
- Plain-HTTP `http://lyniagoadmin.lyniafinance.com` 301-redirects to HTTPS.

## Rollback

- **Bad revision:** `gcloud run services update-traffic lynia-admin --region africa-south1 --to-revisions <PREV>=100`.
- **Take the console dark:** set `GCP_ADMIN_ENABLED=false` (stops deploys) and/or `admin_enabled=false` +
  `terraform apply` (removes the edge). The API is untouched either way.
